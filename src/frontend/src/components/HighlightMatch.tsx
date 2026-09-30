// highlight-match.tsx — bôi sáng phần khớp từ khoá tìm kiếm trong 1
// chuỗi text (tên khách/SĐT) — dùng chung cho PaymentQueue.tsx (Hàng
// đợi) và DriverOrderHistory.tsx (Hôm nay/Tuần này/Tháng này), cả 2 đều
// có ô tìm kiếm theo tên hoặc SĐT khách.

import { Fragment } from "react";

// Bỏ dấu tiếng Việt để so khớp "không phân biệt dấu" (khách gõ "toan"
// vẫn tìm ra "Toàn") — cùng kỹ thuật đã dùng ở OCR backend
// (vps-worker/src/lib/ocr.js) cho mục đích tương tự.
function stripDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/giu, (m) => (m === "đ" ? "d" : "D"));
}

export function matchesQuery(text: string, query: string): boolean {
  if (!query.trim()) return true;
  return stripDiacritics(text)
    .toLowerCase()
    .includes(stripDiacritics(query).toLowerCase());
}

// Trả về text với phần khớp query được bọc <mark> — không phân biệt
// hoa/thường/dấu, nhưng GIỮ NGUYÊN chữ gốc (chỉ bôi sáng, không đổi
// cách hiển thị chữ có dấu).
export function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const trimmed = query.trim();
  if (!trimmed) return <>{text}</>;

  const normalizedText = stripDiacritics(text).toLowerCase();
  const normalizedQuery = stripDiacritics(trimmed).toLowerCase();
  const idx = normalizedText.indexOf(normalizedQuery);
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + trimmed.length);
  const after = text.slice(idx + trimmed.length);

  return (
    <Fragment>
      {before}
      <mark className="rounded-sm bg-amber-300/60 text-inherit">{match}</mark>
      {after}
    </Fragment>
  );
}
