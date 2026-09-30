// lib/printer.ts — kết nối máy in nhiệt USB (ESC/POS) qua WebUSB và dựng
// nội dung phiếu thanh toán tại quầy.
//
// CHỈ hoạt động trên Chrome/Edge (WebUSB không có ở Safari/Firefox). Trên
// Windows, máy in cần được cài lại driver bằng Zadig (thay driver mặc
// định bằng WinUSB) TRƯỚC — nếu không, trình duyệt sẽ báo lỗi "Access
// denied" khi mở kết nối (device.open()) dù đã chọn được thiết bị ở bước
// requestDevice(). Xem trang hướng dẫn /counter/may-in.
//
// KHÔNG dùng thư viện @point-of-sale/webusb-receipt-printer cho bước kết
// nối — thư viện đó chỉ nhận diện máy in qua 1 danh sách VendorID/
// ProductID cố định sẵn trong mã nguồn (không tuỳ chỉnh được), và
// Xprinter chỉ có DUY NHẤT 1 ProductID trong danh sách đó — model khác
// (như XP-N160II) có thể không khớp, khiến máy in không hiện ra trong
// hộp thoại chọn thiết bị. Thay vào đó, TỰ dò tìm theo USB Printer Class
// Code (7) — chuẩn chung mọi máy in USB phải khai báo, không phụ thuộc
// nhà sản xuất/model cụ thể — để nhận diện được máy in bất kỳ.
//
// VẪN dùng @point-of-sale/receipt-printer-encoder để dựng bytes ESC/POS
// (text, bảng, QR code, cắt giấy...) — phần này không liên quan tới
// bước kết nối, an toàn khi tách riêng.

import { COMPANY_INFO } from "@/lib/company-info";
import type { InvoiceResponse } from "@/types";
import ReceiptPrinterEncoder from "@point-of-sale/receipt-printer-encoder";

const USB_PRINTER_CLASS_CODE = 7;
const STORAGE_KEY = "bbh_counter_printer";

interface StoredPrinterInfo {
  vendorId: number;
  productId: number;
  serialNumber?: string;
}

interface PrinterHandle {
  device: USBDevice;
  interfaceNumber: number;
  outEndpoint: number;
}

let activeHandle: PrinterHandle | null = null;

function findPrinterInterface(
  device: USBDevice,
): { interfaceNumber: number; outEndpoint: number } | null {
  for (const config of device.configurations) {
    for (const iface of config.interfaces) {
      for (const alt of iface.alternates) {
        if (alt.interfaceClass === USB_PRINTER_CLASS_CODE) {
          const out = alt.endpoints.find((e) => e.direction === "out");
          if (out) {
            return {
              interfaceNumber: iface.interfaceNumber,
              outEndpoint: out.endpointNumber,
            };
          }
        }
      }
    }
  }
  return null;
}

async function openDevice(device: USBDevice): Promise<PrinterHandle> {
  const found = findPrinterInterface(device);
  if (!found) {
    throw new Error(
      "Không tìm thấy giao diện máy in (USB Printer Class) trên thiết bị đã chọn.",
    );
  }
  await device.open();
  if (device.configuration === null) {
    await device.selectConfiguration(1);
  }
  await device.claimInterface(found.interfaceNumber);
  return {
    device,
    interfaceNumber: found.interfaceNumber,
    outEndpoint: found.outEndpoint,
  };
}

function saveStoredInfo(device: USBDevice) {
  const info: StoredPrinterInfo = {
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber ?? undefined,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // localStorage không khả dụng — vẫn in được trong phiên hiện tại.
  }
}

function loadStoredInfo(): StoredPrinterInfo | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** true nếu trình duyệt hỗ trợ WebUSB (Chrome/Edge — không Safari/Firefox). */
export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

/**
 * Mở hộp thoại chọn thiết bị USB (chỉ hiện máy in — lọc theo USB Printer
 * Class Code) — gọi 1 lần lúc cài đặt ban đầu. Sau khi chọn, quyền truy
 * cập được trình duyệt tự nhớ cho các lần sau (dùng reconnectPrinter()).
 */
export async function pairPrinter(): Promise<void> {
  const device = await navigator.usb.requestDevice({
    filters: [{ classCode: USB_PRINTER_CLASS_CODE }],
  });
  activeHandle = await openDevice(device);
  saveStoredInfo(device);
}

/**
 * Tự động kết nối lại máy in đã ghép nối trước đó — KHÔNG hiện hộp thoại
 * chọn thiết bị (dùng navigator.usb.getDevices(), chỉ trả về thiết bị
 * trình duyệt đã cấp quyền từ trước qua pairPrinter()). Gọi lúc vào
 * trang /counter — trả về false nếu chưa từng ghép nối hoặc thiết bị
 * không còn cắm.
 */
export async function reconnectPrinter(): Promise<boolean> {
  const stored = loadStoredInfo();
  if (!stored) return false;
  const devices = await navigator.usb.getDevices();
  const match = devices.find(
    (d) =>
      d.vendorId === stored.vendorId &&
      d.productId === stored.productId &&
      (!stored.serialNumber || d.serialNumber === stored.serialNumber),
  );
  if (!match) return false;
  activeHandle = await openDevice(match);
  return true;
}

export function isPrinterConnected(): boolean {
  return activeHandle !== null;
}

export function forgetPrinter(): void {
  activeHandle = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // bỏ qua
  }
}

export async function sendBytes(bytes: Uint8Array): Promise<void> {
  if (!activeHandle) {
    throw new Error("Chưa kết nối máy in.");
  }
  // encode() trả về Uint8Array<ArrayBufferLike> — transferOut() cần đúng
  // ArrayBuffer (không phải SharedArrayBuffer) nên tạo bản sao chuẩn.
  const buffer = new Uint8Array(bytes);
  await activeHandle.device.transferOut(activeHandle.outEndpoint, buffer);
}

function formatVnd(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(Math.round(n))}đ`;
}

function formatDateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PrintReceiptInput {
  orderId: string;
  invoice: InvoiceResponse;
  /** Số cột giấy — mặc định 48 (đúng theo profile "xprinter-xp-n160ii"
   * — Font A, khổ 80mm — đã công bố sẵn trong thư viện
   * @point-of-sale/receipt-printer-encoder). Đổi thành 32 nếu dùng khổ
   * giấy 58mm. */
  columns?: 32 | 42 | 48;
}

/**
 * Dựng bytes ESC/POS cho phiếu thanh toán, theo đúng mẫu phiếu tham
 * khảo (tên/địa chỉ/MST doanh nghiệp, số hoá đơn, danh sách món, tổng
 * tiền, khối "Thông tin HĐĐT" với mã tra cứu/mã CQT/QR).
 */
export function buildReceiptBytes(input: PrintReceiptInput): Uint8Array {
  const { orderId, invoice, columns = 48 } = input;
  const items = invoice.items ?? [];
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

  // LƯU Ý QUAN TRỌNG VỀ TIẾNG VIỆT: bảng mã "xprinter" có sẵn trong thư
  // viện này KHÔNG chứa windows1258 (tiếng Việt) — dù phần cứng Xprinter
  // thực tế hỗ trợ tiếng Việt qua mã số 27 ("Vietnam", theo dữ liệu công
  // khai escpos-printer-db). Dùng bảng mã TUỲ CHỈNH { windows1258: 27 }
  // thay vì tên "xprinter" có sẵn, để ép đúng vị trí lệnh chọn trang mã.
  // CHƯA THỂ KIỂM CHỨNG trên phần cứng thật trong môi trường phát triển
  // này — sau khi lắp máy in thật, NẾU dấu tiếng Việt in sai/lỗi, đây là
  // chỗ đầu tiên cần thử đổi số (một số máy Xprinter đời khác dùng vị
  // trí khác cho "Vietnam").
  const encoder = new ReceiptPrinterEncoder({
    language: "esc-pos",
    columns,
    codepageMapping: { windows1258: 27 },
  });

  encoder.initialize().codepage("windows1258");

  encoder
    .align("center")
    .bold(true)
    .line(COMPANY_INFO.name)
    .bold(false)
    .line(COMPANY_INFO.address)
    .line(`MST: ${COMPANY_INFO.taxCode}`)
    .line(`ĐT: ${COMPANY_INFO.phone}`)
    .newline()
    .bold(true)
    .line("PHIẾU THANH TOÁN")
    .bold(false)
    .align("left")
    .line(`Mã đơn: ${orderId}`)
    .line(`Ngày tạo: ${formatDateTime(invoice.createdAt ?? Date.now())}`)
    .rule()
    .table(
      [
        { width: columns - 14, align: "left" },
        { width: 6, align: "right" },
        { width: 8, align: "right" },
      ],
      [
        [
          (e) => e.bold(true).text("Tên món").bold(false),
          (e) => e.bold(true).text("SL").bold(false),
          (e) => e.bold(true).text("T.Tiền").bold(false),
        ],
      ],
    )
    .rule();

  for (const it of items) {
    encoder.table(
      [
        { width: columns - 14, align: "left" },
        { width: 6, align: "right" },
        { width: 8, align: "right" },
      ],
      [[it.name, String(it.quantity), formatVnd(it.price * it.quantity)]],
    );
  }

  encoder
    .rule()
    .table(
      [
        { width: columns - 12, align: "left" },
        { width: 12, align: "right" },
      ],
      [
        ["Tổng SL món", String(totalQty)],
        ["Tổng tiền thuế", formatVnd(invoice.taxTotal ?? 0)],
      ],
    )
    .newline()
    .bold(true)
    .table(
      [
        { width: columns - 12, align: "left" },
        { width: 12, align: "right" },
      ],
      [["TỔNG THANH TOÁN", formatVnd(invoice.amount ?? 0)]],
    )
    .bold(false)
    .newline()
    .align("center")
    .line("** Thông tin hoá đơn điện tử **")
    .align("left")
    .line(`Số hoá đơn: ${invoice.invoiceId}`)
    .line(`Mã tra cứu: ${invoice.maTraCuu || "—"}`)
    .line(`Mã CQT: ${invoice.maCQT || "—"}`)
    .newline();

  if (invoice.sharedLink) {
    encoder.align("center").qrcode(invoice.sharedLink).newline();
  }

  encoder.align("center").line("Cảm ơn quý khách!").newline().newline().cut();

  return encoder.encode();
}

/** In phiếu thanh toán — kết nối phải sẵn sàng từ trước (pairPrinter()
 * hoặc reconnectPrinter() đã gọi thành công). */
export async function printReceipt(input: PrintReceiptInput): Promise<void> {
  const bytes = buildReceiptBytes(input);
  await sendBytes(bytes);
}
