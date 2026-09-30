// ============================================================
// lib/invoice-receipt.ts — In PHIẾU HOÁ ĐƠN (đúng mẫu phiếu tại quầy) sau
// khi hoá đơn Bkav đã phát hành — dùng ở /driver cho đơn đặt món từ xa.
// ============================================================
// Chế độ in theo "Cấu hình máy in" (lib/payment-slip.ts getPrintMode()):
//   - "usb": gọi ĐÚNG printReceipt() của quầy (ESC/POS, lib/printer.ts).
//   - "system": bản HTML CÙNG nội dung phiếu quầy, in qua hộp thoại in của
//     hệ điều hành — để dùng được trên điện thoại (iPhone không có WebUSB).
//     Bản HTML in link tra cứu hoá đơn dạng chữ thay cho mã QR.
// Chỉ in được khi hoá đơn đã phát hành (getInvoice trả ok) — nếu chưa có
// hoá đơn, throw để giao diện báo rõ.
// ============================================================

import { COMPANY_INFO } from "@/lib/company-info";
import { getPrintMode, printViaSystem } from "@/lib/payment-slip";
import {
  isPrinterConnected,
  printReceipt,
  reconnectPrinter,
} from "@/lib/printer";
import { getInvoice } from "@/lib/vps-client";
import type { InvoiceResponse } from "@/types";

function vnd(n: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(n)}đ`;
}

function dateTime(ms: number): string {
  const d = new Date(ms);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );
}

export function buildInvoiceReceiptHtml(
  orderId: string,
  invoice: InvoiceResponse,
): string {
  const items = invoice.items ?? [];
  const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);
  const rows = items
    .map(
      (it) =>
        `<tr><td>${esc(it.name)}</td><td class="r">${it.quantity}</td><td class="r">${vnd(it.price * it.quantity)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Phiếu thanh toán ${esc(orderId)}</title>
<style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: Arial, sans-serif; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
.c { text-align: center; } .r { text-align: right; white-space: nowrap; }
h1 { font-size: 14px; margin: 0; } h2 { font-size: 13px; margin: 8px 0; text-align: center; }
table { width: 100%; border-collapse: collapse; } td, th { padding: 2px 0; vertical-align: top; }
th { text-align: left; } hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.total td { font-weight: bold; font-size: 14px; } .link { word-break: break-all; }
</style></head><body>
<div class="c"><h1>${esc(COMPANY_INFO.name)}</h1>
<div>${esc(COMPANY_INFO.address)}</div><div>MST: ${esc(COMPANY_INFO.taxCode)}</div><div>ĐT: ${esc(COMPANY_INFO.phone)}</div></div>
<h2>PHIẾU THANH TOÁN</h2>
<div>Mã đơn: ${esc(orderId)}</div>
<div>Ngày tạo: ${dateTime(invoice.createdAt ?? Date.now())}</div>
<hr><table><tr><th>Tên món</th><th class="r">SL</th><th class="r">T.Tiền</th></tr>${rows}</table><hr>
<table><tr><td>Tổng SL món</td><td class="r">${totalQty}</td></tr>
<tr><td>Tổng tiền thuế</td><td class="r">${vnd(invoice.taxTotal ?? 0)}</td></tr>
<tr class="total"><td>TỔNG THANH TOÁN</td><td class="r">${vnd(invoice.amount ?? 0)}</td></tr></table>
<p class="c">** Thông tin hoá đơn điện tử **</p>
<div>Số hoá đơn: ${esc(invoice.invoiceId)}</div>
<div>Mã tra cứu: ${esc(invoice.maTraCuu || "—")}</div>
<div>Mã CQT: ${esc(invoice.maCQT || "—")}</div>
${invoice.sharedLink ? `<div class="link">Tra cứu: ${esc(invoice.sharedLink)}</div>` : ""}
<p class="c">Cảm ơn quý khách!</p>
</body></html>`;
}

/** In phiếu hoá đơn của đơn đã phát hành hoá đơn Bkav. */
export async function printInvoiceReceipt(orderId: string): Promise<void> {
  const invoice = await getInvoice(orderId);
  if (!invoice.ok) {
    throw new Error(invoice.error || "Không lấy được dữ liệu hoá đơn.");
  }
  if (getPrintMode() === "usb") {
    if (!isPrinterConnected()) {
      const ok = await reconnectPrinter();
      if (!ok) {
        throw new Error(
          'Chưa kết nối máy in USB — vào "Cấu hình máy in" để kết nối.',
        );
      }
    }
    await printReceipt({ orderId, invoice });
    return;
  }
  printViaSystem(buildInvoiceReceiptHtml(orderId, invoice));
}
