const { expect } = require("chai");
const { ethers } = require("hardhat");
const { load, SRC } = require("./uiSource");

// Dùng ĐÚNG hàm reasonOf() và esc() của giao diện (đọc từ app/app.js), không chép tay.
// Địa chỉ hợp đồng được ghi cứng trong app.js, nhưng chuỗi lỗi vẫn đến từ RPC: một RPC độc hại trả
// được BẤT KỲ chuỗi nào. Các test dựng thẳng đối tượng lỗi như RPC trả về, không cần contract nào.
const ui = load(["ERR_VI", "ABI", "IFACE", "decodeRevertName", "reasonOf", "esc"], ethers);

describe("XSS qua chuỗi lỗi từ RPC / revert", function () {
  const PAYLOAD = "<img src=x onerror=\"alert('XSS')\">";

  it("revert Error(string) mang payload: tới được client, nhưng reasonOf() thật chỉ hiện tên lỗi", () => {
    const data = ethers.id("Error(string)").slice(0, 10) +
      ethers.AbiCoder.defaultAbiCoder().encode(["string"], [PAYLOAD]).slice(2);
    const err = ethers.makeError("execution reverted", "CALL_EXCEPTION",
      { action: "estimateGas", data, reason: PAYLOAD, transaction: { to: null, data: "0x" }, invocation: null, revert: null });
    // Mối đe dọa có thật: chuỗi do kẻ tấn công chọn đi tới client nguyên vẹn trong đối tượng lỗi.
    expect(err.reason).to.equal(PAYLOAD);
    const shown = ui.reasonOf(err);
    expect(shown).to.equal("Contract từ chối (Error)");
    expect(shown).to.not.include("<img");
  });

  it("RPC độc hại trả lỗi JSON-RPC chứa payload: reasonOf() trả nguyên chuỗi — lớp chặn là chỗ hiển thị", () => {
    // Địa chỉ hợp đồng ghi cứng KHÔNG chặn được đường này: thông điệp lỗi do RPC tự soạn.
    const shown = ui.reasonOf({ code: -32000, message: PAYLOAD });
    expect(shown).to.equal(PAYLOAD);
    expect(ui.esc(shown)).to.not.include("<img");
  });

  it("mọi nơi dùng reasonOf() trong app.js đều đi qua bannerText / esc / alert (không chèn thẳng vào innerHTML)", () => {
    const lines = SRC.split("\n");
    const sinks = [];
    lines.forEach((ln, i) => {
      if (!ln.includes("reasonOf(") || /function reasonOf/.test(ln)) return;
      if (/bannerText\([^)]*reasonOf\(/.test(ln)) return;                 // textContent
      if (/\(e\) => \(\{ err: reasonOf\(e\) \}\)/.test(ln)) return;        // crossCall: chỉ đếm số lỗi
      if (/d\.logsError = reasonOf\(e\)/.test(ln)) return;                  // hiển thị qua esc(DIR.logsError)
      const m = ln.match(/const (\w+) = reasonOf\(err\);/);
      if (m) {
        // Biến nhận kết quả chỉ được dùng trong logEntry (renderLedger esc từng trường), bannerText hoặc alert.
        const next = lines.slice(i + 1, i + 4).filter((l) => new RegExp("\\b" + m[1] + "\\b").test(l));
        if (next.every((l) => /logEntry\(|bannerText\(|alert\(/.test(l))) return;
      }
      sinks.push((i + 1) + ": " + ln.trim());
    });
    expect(sinks, "chỗ dùng reasonOf() chưa được chứng minh an toàn").to.deep.equal([]);
    expect(SRC).to.include("esc(DIR.logsError)");
    expect(SRC).to.include('rows.push(["Lý do", esc(e.reason)])');
  });

  it("esc() vô hiệu hóa payload", () => {
    const safe = ui.esc(PAYLOAD);   // hàm thật của giao diện
    expect(safe).to.not.include("<img");
    expect(safe).to.include("&lt;img");
  });
});
