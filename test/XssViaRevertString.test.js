const { expect } = require("chai");
const { ethers } = require("hardhat");


describe("XSS qua chuỗi revert của contract", function () {
  const PAYLOAD = "<img src=x onerror=\"alert('XSS')\">";

  it("chuỗi revert do kẻ tấn công chọn tới được client nguyên vẹn", async function () {
    const Evil = await ethers.getContractFactory("EvilRegistry");
    const evil = await Evil.deploy();
    await evil.waitForDeployment();

    let captured = null;
    try {
      await evil.issueCertificate(ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroAddress);
    } catch (err) {
      // Sao chép NGUYÊN VĂN hàm reasonOf() trong app/index.html
      captured = err?.reason || err?.shortMessage || err?.info?.error?.message
                 || err?.message || "Không rõ nguyên nhân";
    }

    // Tùy môi trường mà payload nằm ở err.reason (MetaMask + node JSON-RPC)
    // hay err.message (EVM in-process của Hardhat). Điều quan trọng không đổi:
    // chuỗi do KẺ TẤN CÔNG chọn đi tới client nguyên vẹn, rồi được ghép vào innerHTML.
    expect(captured).to.include(PAYLOAD);
    expect(captured).to.include("<img");
    expect(captured).to.include("onerror");
  });

  it("Deploy contract giả", async function () {
    const Evil = await ethers.getContractFactory("EvilRegistry");
    const evil = await Evil.deploy();
    await evil.waitForDeployment();
    const addr = await evil.getAddress();

    // getCode(): địa chỉ này CÓ mã -> qua được kiểm tra FE-04
    expect(await ethers.provider.getCode(addr)).to.not.equal("0x");

    // chainId: contract giả nằm trên cùng chain với contract thật -> qua được kiểm tra FE-03
    const net = await ethers.provider.getNetwork();
    expect(net.chainId).to.equal(31337n);

    // Và nó trả "hợp lệ" cho một tệp chưa từng được cấp.
    const [valid] = await evil.verifyCertificate(ethers.ZeroHash, ethers.ZeroHash);
    expect(valid).to.equal(true);
  });

  it("esc() vô hiệu hóa payload", async function () {
    const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const safe = esc(PAYLOAD);
    expect(safe).to.not.include("<img");
    expect(safe).to.include("&lt;img");
  });
});
