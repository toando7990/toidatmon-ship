// Nút copy MÃ ĐƠN dùng chung cho mọi loại thẻ đơn (khách "Theo dõi", hàng
// đợi /driver, xác nhận lấy hàng, Kế toán, trang theo dõi chi tiết). Chỉ
// biểu tượng để gọn trong thẻ; có aria-label cho trình đọc màn hình.
// stopPropagation để bấm copy không kích hoạt hành động của thẻ bao ngoài.
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Dự phòng cho trình duyệt/webview không có Clipboard API.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;opacity:0;";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export function CopyOrderIdButton({
  orderId,
  ocid,
}: {
  orderId: string;
  ocid?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await copyText(orderId);
          setCopied(true);
          toast.success("Đã sao chép mã đơn");
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error("Không sao chép được mã đơn");
        }
      }}
      aria-label={`Sao chép mã đơn ${orderId}`}
      title="Sao chép mã đơn"
      data-ocid={ocid ?? "copy_order_id_button"}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-smooth hover:bg-secondary hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
