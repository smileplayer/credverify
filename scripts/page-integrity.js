// =============================================================================
//  Giữ CSP và SRI của giao diện (app/index.html + app.js + app.css) khớp với mã.
//
//    node scripts/page-integrity.js            # đồng bộ connect-src theo RPC_URLS (app.js)
//    node scripts/page-integrity.js --release  # + gắn integrity (SRI sha384) cho app.js, app.css
//    node scripts/page-integrity.js --dev      # + gỡ integrity (để sửa app.js thoải mái)
//    node scripts/page-integrity.js --check    # chỉ kiểm; thoát mã 1 nếu lệch (test dùng)
//
//  1. connect-src = đúng các origin trong RPC_URLS — không hơn (XSS lọt cũng không gửi ra ngoài).
//  2. Không còn khối <script> nội tuyến; script-src không có 'unsafe-inline'.
//  3. SRI (khi phát hành): index.html mang hash của app.js và app.css, nên hash của riêng
//     index.html — hoặc CID IPFS — bao trọn cả trang. Kẻ chiếm host sửa app.js thì trình duyệt
//     từ chối chạy. Khi phát triển KHÔNG cần SRI; nhưng nếu ĐÃ có integrity mà lệch, trang chết
//     — nên --check báo lỗi ngay.
// =============================================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP = path.join(__dirname, "..", "app");
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");
const sri = (text) => "sha384-" + crypto.createHash("sha384").update(text, "utf8").digest("base64");

function rpcOrigins(js) {
  const m = js.match(/const RPC_URLS = (\[[^\]]*\]);/);
  if (!m) throw new Error("Không tìm thấy hằng RPC_URLS trong app.js");
  const urls = JSON.parse(m[1].replace(/'/g, '"'));
  return [...new Set(urls.map((u) => new URL(u).origin))];
}

const SCRIPT_RE = /<script src="app\.js"[^>]*><\/script>/;
const STYLE_RE = /<link rel="stylesheet" href="app\.css"[^>]*>/;

/** mode: undefined = giữ nguyên integrity; "release" = gắn; "dev" = gỡ. */
function apply(html, { js, css }, mode) {
  const csp = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/;
  if (!csp.test(html)) throw new Error("Không tìm thấy thẻ meta CSP");
  if (!SCRIPT_RE.test(html) || !STYLE_RE.test(html)) throw new Error("Không tìm thấy thẻ nạp app.js / app.css");
  let out = html.replace(csp, (_, a, c, z) => a + c.replace(/connect-src [^;]*;/, `connect-src ${rpcOrigins(js).join(" ")};`) + z);
  if (mode === "release") {
    out = out.replace(SCRIPT_RE, `<script src="app.js" integrity="${sri(js)}"></script>`)
             .replace(STYLE_RE, `<link rel="stylesheet" href="app.css" integrity="${sri(css)}">`);
  } else if (mode === "dev") {
    out = out.replace(SCRIPT_RE, '<script src="app.js"></script>')
             .replace(STYLE_RE, '<link rel="stylesheet" href="app.css">');
  }
  return out;
}

/** Trả danh sách vấn đề (rỗng = ổn). */
function problems(html, { js, css }) {
  const out = [];
  if (apply(html, { js, css }) !== html) out.push("connect-src không khớp RPC_URLS trong app.js");
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) out.push("còn khối <script> nội tuyến — CSP sẽ chặn nó");
  const c = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
  if (/script-src[^;]*'unsafe-inline'/.test(c)) out.push("script-src có 'unsafe-inline'");
  if (/script-src[^;]*'sha256-/.test(c)) out.push("script-src còn hash script nội tuyến (thừa)");
  const ij = (html.match(SCRIPT_RE)[0].match(/integrity="([^"]+)"/) || [])[1];
  const ic = (html.match(STYLE_RE)[0].match(/integrity="([^"]+)"/) || [])[1];
  if (ij && ij !== sri(js)) out.push("integrity của app.js đã cũ — trình duyệt sẽ CHẶN app.js");
  if (ic && ic !== sri(css)) out.push("integrity của app.css đã cũ — trình duyệt sẽ CHẶN app.css");
  return out;
}

function main() {
  const html = read("index.html"), parts = { js: read("app.js"), css: read("app.css") };
  if (process.argv.includes("--check")) {
    const p = problems(html, parts);
    if (p.length) { console.error("Giao diện chưa khớp:\n - " + p.join("\n - ") + "\nChạy: node scripts/page-integrity.js [--release|--dev]"); process.exit(1); }
    console.log("CSP/SRI khớp.");
    return;
  }
  const mode = process.argv.includes("--release") ? "release" : process.argv.includes("--dev") ? "dev" : undefined;
  fs.writeFileSync(path.join(APP, "index.html"), apply(html, parts, mode), "utf8");
  console.log("Đã cập nhật app/index.html — connect-src:", rpcOrigins(parts.js).join(" "),
    mode === "release" ? "· SRI app.js " + sri(parts.js) + " · app.css " + sri(parts.css) : mode === "dev" ? "· đã gỡ SRI" : "");
}

if (require.main === module) main();
module.exports = { apply, problems, rpcOrigins, sri };
