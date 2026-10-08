// Quy tắc tên đơn vị phát hành — DÙNG CHUNG cho script, giao diện (app/app.js) và bài báo.
//
// CHUẨN HÓA (canonicalName) — áp dụng cả lúc CÔNG NHẬN lẫn lúc TRA, để tên gõ/dán từ PDF vẫn khớp:
//   1. Unicode NFC (dạng dựng sẵn: "â" là MỘT code point, không phải "a" + dấu mũ rời).
//   2. Bỏ ký tự vô hình: soft hyphen, zero-width space/joiner/non-joiner, word joiner, BOM.
//   3. Mọi biến thể gạch ngang (‐ ‑ ‒ – — ― −) đổi thành "-".
//   4. Mọi chuỗi khoảng trắng (space, tab, xuống dòng, NBSP…) gộp thành MỘT dấu cách.
//   5. Bỏ khoảng trắng ở đầu và cuối.
//   Chữ hoa/thường và dấu tiếng Việt được GIỮ NGUYÊN — đó là một phần của tên.
//
// DANH SÁCH CHO PHÉP (nameProblem) — contract kiểm LẠI đúng danh sách này trên chuỗi:
//   chữ cái ASCII, chữ số, dấu cách, "(", ")", ",", "-", và 134 chữ có dấu tiếng Việt (dạng dựng sẵn).
//   Mọi ký tự khác (dấu chấm, & # % ' / …, chữ Kirin/Hy Lạp) bị từ chối.
const VN_LETTERS =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝàáâãèéêìíòóôõùúýĂăĐđĨĩŨũƠơƯư" +
  Array.from({ length: 0x1EF9 - 0x1EA0 + 1 }, (_, i) => String.fromCharCode(0x1EA0 + i)).join("");
const ALLOWED = new RegExp("^[A-Za-z0-9 (),\\-" + VN_LETTERS + "]*$", "u");

function canonicalName(s) {
  return String(s ?? "")
    .normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/[\u2010-\u2015\u2212]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}

/** null nếu tên (đã chuẩn hóa) hợp lệ; ngược lại là câu giải thích tiếng Việt. */
function nameProblem(name) {
  const s = String(name ?? "");
  if (!s) return "Tên rỗng.";
  if (Buffer.byteLength(s, "utf8") > 256) return "Tên dài quá 256 byte.";
  if (!ALLOWED.test(s)) {
    const bad = [...s].find((ch) => !ALLOWED.test(ch));
    return `Ký tự "${bad}" (U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}) không được phép. ` +
      "Chỉ dùng chữ cái tiếng Việt, chữ số, dấu cách, ( ) , -";
  }
  if (s !== s.trim() || / {2}/.test(s)) return "Tên có khoảng trắng thừa.";
  return null;
}

module.exports = { canonicalName, nameProblem, VN_LETTERS };
