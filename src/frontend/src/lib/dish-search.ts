// Tìm món trên trang chủ nhiều quán — chạy hoàn toàn ở trình duyệt, KHÔNG cần
// admin cấu hình từ đồng nghĩa. Khách gõ kiểu nào cũng ra:
//   - không dấu:      "bun bo"  → "Bún bò"
//   - viết tắt:       "bbh"     → "Bún bò Huế" (chữ cái đầu các từ liền nhau)
//   - gõ sai nhẹ:     "phoo", "suonn" → sai 1 ký tự (từ ≥4 chữ), 2 ký tự (từ ≥7 chữ)
//   - một phần từ:    "suon"    → "Cơm tấm sườn"
// Mọi từ khách gõ phải khớp (AND); điểm cao hơn cho khớp chính xác/đầu từ.

export function normalizeVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(s: string): string[] {
  const n = normalizeVi(s);
  return n ? n.split(" ") : [];
}

// Khoảng cách sửa (Damerau rút gọn: chèn/xoá/thay/đổi chỗ 2 ký tự kề).
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2 = new Array(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

function allowedTypos(token: string): number {
  if (token.length >= 7) return 2;
  if (token.length >= 4) return 1;
  return 0;
}

// Điểm khớp của 1 từ khoá với danh sách từ của nội dung; 0 = không khớp.
function tokenScore(token: string, textWords: string[]): number {
  let best = 0;
  for (const w of textWords) {
    if (w === token) return 10;
    if (w.startsWith(token)) best = Math.max(best, 8);
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 5);
    else {
      const max = allowedTypos(token);
      if (max > 0) {
        // So với phần đầu cùng độ dài để từ gõ dở vẫn khớp từ dài hơn
        const target =
          w.length > token.length + max ? w.slice(0, token.length) : w;
        if (editDistance(token, target, max) <= max) best = Math.max(best, 4);
      }
    }
  }
  if (best === 0 && /^[a-z]{2,6}$/.test(token)) {
    // Viết tắt: chữ cái đầu của các từ liền nhau ("bbh" = bún bò huế)
    for (let i = 0; i + token.length <= textWords.length; i++) {
      let ok = true;
      for (let k = 0; k < token.length; k++) {
        if (textWords[i + k][0] !== token[k]) {
          ok = false;
          break;
        }
      }
      if (ok) return 7;
    }
  }
  return best;
}

/** Điểm khớp của truy vấn với nội dung (tên món, tên quán, nhóm). 0 = loại. */
export function matchScore(query: string, ...fields: string[]): number {
  const qTokens = words(query);
  if (qTokens.length === 0) return 1;
  const textWords = fields.flatMap(words);
  if (textWords.length === 0) return 0;
  let total = 0;
  for (const t of qTokens) {
    const s = tokenScore(t, textWords);
    if (s === 0) return 0;
    total += s;
  }
  // Ưu tiên khớp ngay ở tên món (field đầu tiên)
  const primary = words(fields[0] ?? "");
  const primaryHits = qTokens.filter((t) => tokenScore(t, primary) > 0).length;
  return total + primaryHits * 3;
}
