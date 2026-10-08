const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { apply, problems, sri } = require("../scripts/page-integrity");

// Giao diện gồm index.html + app.js + app.css. Test vỡ khi CSP/SRI lệch với mã —
// nếu không, trình duyệt sẽ âm thầm chặn script hoặc kiểu dáng.
describe("CSP và SRI của giao diện", function () {
  const APP = path.join(__dirname, "..", "app");
  const html = fs.readFileSync(path.join(APP, "index.html"), "utf8");
  const parts = { js: fs.readFileSync(path.join(APP, "app.js"), "utf8"), css: fs.readFileSync(path.join(APP, "app.css"), "utf8") };

  it("không có vấn đề: connect-src khớp RPC_URLS, không script nội tuyến, integrity (nếu có) khớp", () => {
    expect(problems(html, parts)).to.deep.equal([]);
  });
  it("script-src không 'unsafe-inline'; không connect-src *; không Google Fonts", () => {
    const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
    expect(csp).to.match(/script-src 'self' https:\/\/cdn\.jsdelivr\.net;/);
    expect(csp).to.not.match(/'unsafe-inline'[^;]*;\s*style-src/);
    expect(csp).to.not.match(/connect-src \*/);
    for (const t of [html, parts.css]) { expect(t).to.not.include("fonts.googleapis.com"); expect(t).to.not.include("fonts.gstatic.com"); }
  });
  it("--release gắn SRI đúng; sửa app.js sau đó thì --check bắt được integrity cũ", () => {
    const rel = apply(html, parts, "release");
    expect(rel).to.include(`integrity="${sri(parts.js)}"`);
    expect(rel).to.include(`integrity="${sri(parts.css)}"`);
    expect(problems(rel, parts)).to.deep.equal([]);
    const p = problems(rel, { ...parts, js: parts.js + "\n// sửa" });
    expect(p.join()).to.include("integrity của app.js đã cũ");
    expect(apply(rel, parts, "dev")).to.equal(apply(html, parts));
  });
  it("phát hiện khối script nội tuyến bị thêm vào", () => {
    const bad = html.replace("</body>", "<script>alert(1)</script></body>");
    expect(problems(bad, parts).join()).to.include("nội tuyến");
  });
});
