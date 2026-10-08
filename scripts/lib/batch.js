// Thư viện dùng chung cho cấp theo lô: dựng cây Merkle và biên nhận.
// Cây là OpenZeppelin StandardMerkleTree với kiểu lá ["bytes32","address","bytes32"]
// = (certHash, holder, salt) — khớp hàm `leafOf` trong CredentialRegistry.sol.

const crypto = require("crypto");
const { ethers } = require("ethers");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");

const LEAF_TYPES = ["bytes32", "address", "bytes32"];

/**
 * @param {{name:string, bytes:Buffer|Uint8Array, holder?:string}[]} items
 * @returns {{ tree, root:string, entries:{file:string, certHash:string, holder:string, salt:string, leaf:string, proof:string[]}[] }}
 */
function buildBatch(items) {
  if (!items.length) throw new Error("Lô rỗng");
  const seen = new Set();
  const values = items.map((it) => {
    const certHash = ethers.keccak256(it.bytes);
    if (seen.has(certHash)) throw new Error("Hai tệp trùng nội dung trong cùng một lô: " + it.name);
    seen.add(certHash);
    const holder = it.holder ? ethers.getAddress(it.holder) : ethers.ZeroAddress;
    // Salt ngẫu nhiên mật mã cho TỪNG chứng chỉ. Không dùng Math.random.
    const salt = "0x" + crypto.randomBytes(32).toString("hex");
    return [certHash, holder, salt];
  });
  const tree = StandardMerkleTree.of(values, LEAF_TYPES);
  const entries = items.map((it, i) => ({
    file: it.name,
    certHash: values[i][0],
    holder: values[i][1],
    salt: values[i][2],
    leaf: tree.leafHash(values[i]),
    // revokeLeaf nhận `inner` (hợp đồng tự băm thêm một lần thành lá).
    inner: ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(LEAF_TYPES, values[i])),
    proof: tree.getProof(i),
  }));
  return { tree, root: tree.root, entries };
}

/** Biên nhận cho MỘT chứng chỉ — học viên giữ và nộp kèm tệp khi được xác minh. */
function makeReceipt({ chainId, contract, issuer, issuerName, root, batchId, txHash, blockNumber, issuedAt }, e) {
  return {
    type: "CredVerifyBatchReceipt",
    version: 1,
    chainId: String(chainId),
    contract,
    issuer,
    issuerName,
    root,
    batchId,
    txHash,
    blockNumber,
    issuedAt,
    // KHÔNG ghi tên tệp gốc — tên tệp thường là họ tên học viên, mà biên nhận
    // được gửi qua email / nộp cho nhà tuyển dụng.
    certificate: { certHash: e.certHash, holder: e.holder, salt: e.salt },
    proof: e.proof,
  };
}

/** Tên tệp biên nhận KHÔNG chứa tên tệp gốc: số thứ tự + 8 ký tự đầu của certHash. */
function receiptFileName(e, i) {
  return `${String(i + 1).padStart(3, "0")}-${e.certHash.slice(2, 10)}.receipt.json`;
}

/**
 * Ghi biên nhận cho cả lô vào `dir`, kèm `index.csv` ánh xạ tệp gốc -> biên nhận.
 * index.csv CHỈ để đơn vị cấp tự tra trên máy mình — không gửi cho ai.
 */
function writeReceipts(dir, meta, entries) {
  const fs = require("fs");
  const path = require("path");
  fs.mkdirSync(dir, { recursive: true });
  const csv = ["file,receipt"];
  entries.forEach((e, i) => {
    const name = receiptFileName(e, i);
    fs.writeFileSync(path.join(dir, name), JSON.stringify(makeReceipt(meta, e), null, 2) + "\n", "utf8");
    csv.push(`"${String(e.file).replace(/"/g, '""')}",${name}`);
  });
  fs.writeFileSync(path.join(dir, "index.csv"), csv.join("\n") + "\n", "utf8");
}

module.exports = { LEAF_TYPES, buildBatch, makeReceipt, receiptFileName, writeReceipts };
