// =============================================================================
//  Cấp chứng chỉ THEO LÔ: mỗi tệp trong một thư mục là một chứng chỉ.
//
//    BATCH_DIR=Demo npx hardhat run scripts/issue-batch.js --network localhost
//
//  Biến môi trường:
//    BATCH_DIR        thư mục chứa tệp chứng chỉ (mặc định: Demo)
//    HOLDERS_CSV      tùy chọn, mỗi dòng "tên_tệp,địa_chỉ_ví_học_viên"; thiếu = không gắn ví
//    CONTRACT         địa chỉ CredentialRegistry (mặc định: hằng CONTRACT_ADDRESS trong app/app.js)
//    ISSUER_INDEX     chỉ số signer đóng vai đơn vị phát hành (mặc định 1; trên testnet dùng
//                     DEMO_ISSUER_PRIVATE_KEY trong .env)
//    OUT_DIR          thư mục ghi biên nhận (mặc định receipts/<8 ký tự đầu của root>)
//
//  Kết quả: MỘT giao dịch publishBatch, và MỘT biên nhận .json cho mỗi chứng chỉ.
//  Biên nhận chứa salt — giao cho đúng học viên, không đăng công khai.
//  receipts/ đã nằm trong .gitignore.
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { buildBatch, writeReceipts } = require("./lib/batch");
const { readAnchor } = require("./lib/anchor");

async function main() {
  const { ethers } = hre;
  const dir = path.resolve(process.env.BATCH_DIR || path.join(__dirname, "..", "Demo"));
  // Bỏ tệp ẩn (.DS_Store, desktop.ini…) — chúng sẽ thành "chứng chỉ" trong lô nếu lọt vào.
  const files = fs.readdirSync(dir)
    .filter((f) => !f.startsWith(".") && f.toLowerCase() !== "desktop.ini" && fs.statSync(path.join(dir, f)).isFile())
    .sort();
  if (!files.length) throw new Error("Thư mục không có tệp nào: " + dir);

  const holders = {};
  if (process.env.HOLDERS_CSV) {
    for (const line of fs.readFileSync(process.env.HOLDERS_CSV, "utf8").split(/\r?\n/)) {
      const [f, a] = line.split(",").map((s) => (s || "").trim());
      if (!f) continue;
      if (!ethers.isAddress(a)) throw new Error("Địa chỉ ví không hợp lệ cho " + f + ": " + a);
      holders[f] = a;
    }
  }

  const address = process.env.CONTRACT || readAnchor().addr;
  if (!address || !ethers.isAddress(address)) throw new Error("Không xác định được địa chỉ contract (đặt CONTRACT=0x…)");
  let issuer;
  if (process.env.DEMO_ISSUER_PRIVATE_KEY) {
    issuer = new ethers.Wallet(process.env.DEMO_ISSUER_PRIVATE_KEY, ethers.provider);
  } else {
    issuer = (await ethers.getSigners())[Number(process.env.ISSUER_INDEX || 1)];
  }
  const reg = await ethers.getContractAt("CredentialRegistry", address, issuer);
  if ((await reg.issuerStatus(issuer.address)) !== 1n) {
    throw new Error("Ví " + issuer.address + " không phải đơn vị phát hành đang hoạt động trên contract này.");
  }

  const batch = buildBatch(files.map((f) => ({ name: f, bytes: fs.readFileSync(path.join(dir, f)), holder: holders[f] })));
  console.log(`Lô ${files.length} chứng chỉ, root ${batch.root}`);

  const rc = await (await reg.publishBatch(batch.root, files.length)).wait();
  const block = await ethers.provider.getBlock(rc.blockNumber);
  const meta = {
    chainId: (await ethers.provider.getNetwork()).chainId,
    contract: ethers.getAddress(address),
    issuer: issuer.address,
    issuerName: await reg.issuerName(issuer.address),
    root: batch.root,
    batchId: await reg.batchIdOf(issuer.address, batch.root),
    txHash: rc.hash,
    blockNumber: rc.blockNumber,
    issuedAt: Number(block.timestamp),
  };
  console.log(`publishBatch: tx ${rc.hash} | block ${rc.blockNumber} | gas ${rc.gasUsed}`);

  const out = path.resolve(process.env.OUT_DIR || path.join(__dirname, "..", "receipts", batch.root.slice(2, 10)));
  writeReceipts(out, meta, batch.entries);
  console.log(`Đã ghi ${batch.entries.length} biên nhận vào ${out} (index.csv ánh xạ tệp gốc -> biên nhận, chỉ giữ trên máy đơn vị cấp)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
