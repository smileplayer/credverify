// =============================================================================
//  Đo kích thước tệp biên nhận lô (thẻ T5): dựng lô bằng buildBatch, ghi bằng
//  writeReceipts — đúng hai hàm mà issue-batch.js / seed-sepolia.js dùng — rồi
//  đọc lại số byte của từng tệp trên đĩa.
//
//    node scripts/receipt-size.js                # n = 2, 100, 500, 2000
//    SIZES=10,50 node scripts/receipt-size.js
//    OUT_DIR=... node scripts/receipt-size.js    # mặc định receipts/do-kich-thuoc (đã gitignore)
//
//  Không cần mạng/hardhat node: các trường root, batchId, txHash luôn là chuỗi
//  hex 32 byte, nên giá trị cụ thể không đổi kích thước. Các trường có độ dài
//  thay đổi lấy theo lô demo trên Sepolia (biên nhận receipts/sepolia-demo/):
//  chainId 11155111 (8 chữ số), blockNumber 8 chữ số, issuedAt 10 chữ số,
//  issuerName "Trung tam dao tao Demo". Không gắn ví học viên (holder = 0x0…0,
//  cùng độ dài 42 ký tự như một địa chỉ thật).
//  Biên nhận chứa salt thật (ngẫu nhiên) — thư mục ra nằm dưới receipts/, đã gitignore.
// =============================================================================

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { buildBatch, writeReceipts, receiptFileName } = require("./lib/batch");
const { readAnchor } = require("./lib/anchor");

const sizes = (process.env.SIZES || "2,100,500,2000").split(",").map((s) => Number(s.trim()));
const outRoot = path.resolve(process.env.OUT_DIR || path.join(__dirname, "..", "receipts", "do-kich-thuoc"));
const anchor = readAnchor();

const hex32 = (tag) => ethers.keccak256(ethers.toUtf8Bytes(tag));

const rows = [];
for (const n of sizes) {
  if (!Number.isInteger(n) || n < 1) throw new Error("n không hợp lệ: " + n);
  // Nội dung tệp tất định theo (n, i) → tên biên nhận lặp lại giữa các lần chạy (ghi đè, không đẻ tệp mới).
  const items = Array.from({ length: n }, (_, i) => ({
    name: `chung-chi-${i + 1}.pdf`,
    bytes: Buffer.from(`CredVerify do kich thuoc bien nhan n=${n} #${i + 1}`),
  }));
  const batch = buildBatch(items);
  const meta = {
    chainId: BigInt(anchor.chainId || "11155111"),
    contract: ethers.getAddress(anchor.addr || "0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6"),
    issuer: ethers.getAddress("0x" + hex32("issuer").slice(26)),
    issuerName: "Trung tam dao tao Demo",
    root: batch.root,
    batchId: hex32("batchId " + batch.root),
    txHash: hex32("txHash " + batch.root),
    blockNumber: 11890492,
    issuedAt: 1791706992,
  };
  const dir = path.join(outRoot, `n-${n}`);
  writeReceipts(dir, meta, batch.entries);

  // Đọc lại từ đĩa: số byte UTF-8 thật của tệp và độ dài proof trong tệp.
  const bytes = [];
  const proofLens = [];
  batch.entries.forEach((e, i) => {
    const file = path.join(dir, receiptFileName(e, i));
    const buf = fs.readFileSync(file);
    bytes.push(buf.length);
    proofLens.push(JSON.parse(buf.toString("utf8")).proof.length);
  });
  const sum = bytes.reduce((a, b) => a + b, 0);
  rows.push({
    n,
    min: Math.min(...bytes),
    max: Math.max(...bytes),
    avg: sum / n,
    total: sum,
    pMin: Math.min(...proofLens),
    pMax: Math.max(...proofLens),
    csv: fs.statSync(path.join(dir, "index.csv")).size,
  });
}

const fmt = (x) => Math.round(x).toLocaleString("de-DE"); // dấu chấm phân cách nghìn như GAS-V3.md
const fmt1 = (x) => x.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
console.log(`Ghi vào ${outRoot}\n`);
console.log("| n | Proof (nút) | Biên nhận nhỏ nhất (byte) | Lớn nhất (byte) | Trung bình (byte) | Tổng cả lô (byte) |");
console.log("|---:|---:|---:|---:|---:|---:|");
for (const r of rows) {
  const p = r.pMin === r.pMax ? `${r.pMax}` : `${r.pMin}–${r.pMax}`;
  console.log(`| ${fmt(r.n)} | ${p} | ${fmt(r.min)} | ${fmt(r.max)} | ${fmt1(r.avg)} | ${fmt(r.total)} |`);
}
