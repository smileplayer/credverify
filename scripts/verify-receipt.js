// =============================================================================
//  Xác minh một chứng chỉ cấp theo lô KHÔNG cần trang web: tệp + biên nhận + RPC.
//
//    FILE=Demo/DemoCert.pdf RECEIPT=receipts/xxxx/001-1a2b3c4d.receipt.json \
//      npx hardhat run scripts/verify-receipt.js --network localhost
//
//  Giống giao diện, script KHÔNG tin certHash trong biên nhận (luôn băm tệp thật) và
//  KHÔNG đi theo địa chỉ contract trong biên nhận: nó so với CONTRACT (hoặc hằng neo
//  trong app/app.js) và từ chối nếu khác.
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const { readAnchor } = require("./lib/anchor");

async function main() {
  const { ethers } = hre;
  if (!process.env.FILE || !process.env.RECEIPT) throw new Error("Cần FILE=… và RECEIPT=…");
  const rc = JSON.parse(fs.readFileSync(process.env.RECEIPT, "utf8"));
  if (rc.type !== "CredVerifyBatchReceipt" || rc.version !== 1) throw new Error("Không phải biên nhận CredVerify v1");
  const c = rc.certificate || {};
  if (!ethers.isAddress(rc.contract) || !ethers.isAddress(rc.issuer) || !ethers.isHexString(rc.root, 32) ||
      !ethers.isAddress(c.holder) || !ethers.isHexString(c.salt, 32) || !Array.isArray(rc.proof) ||
      !rc.proof.every((p) => ethers.isHexString(p, 32))) {
    throw new Error("Biên nhận thiếu hoặc sai định dạng trường (contract, issuer, root, certificate.holder/salt, proof)");
  }

  const official = process.env.CONTRACT || readAnchor().addr;
  if (!official || ethers.getAddress(official) !== ethers.getAddress(rc.contract)) {
    throw new Error(`Biên nhận trỏ tới ${rc.contract}, khác contract chính thức ${official}. Từ chối.`);
  }
  const net = await ethers.provider.getNetwork();
  if (BigInt(rc.chainId) !== net.chainId) throw new Error(`Biên nhận thuộc chainId ${rc.chainId}, đang nối ${net.chainId}.`);

  const certHash = ethers.keccak256(fs.readFileSync(process.env.FILE));
  if (rc.certificate.certHash && rc.certificate.certHash.toLowerCase() !== certHash.toLowerCase()) {
    console.log("⚠ Hash trong biên nhận khác hash tệp — dùng hash tệp thật.");
  }
  const reg = await ethers.getContractAt("CredentialRegistry", official);
  const r = await reg.verifyInBatch(rc.issuer, rc.root, certHash, rc.certificate.holder, rc.certificate.salt, rc.proof);
  const iso = (t) => (Number(t) ? new Date(Number(t) * 1000).toISOString() : "—");
  console.log({
    valid: r.valid, batchExists: r.batchExists, inBatch: r.inBatch,
    batchRevoked: r.batchRevoked, leafRevoked: r.leafRevoked,
    revocationVoided: r.revocationVoided, issuedAfterCompromise: r.issuedAfterCompromise,
    compromisedSince: iso(r.compromisedSince), compromiseDeclaredAt: iso(r.compromiseDeclaredAt),
    issuedAt: iso(r.issuedAt), revokedAt: iso(r.revokedAt),
    issuer: rc.issuer, issuerNameOnChain: r.issuerDisplayName,
    issuerState: ["None", "Active", "Disabled"][Number(r.issuerState)],
    currentKeyOfIssuer: await reg.currentKeyOf(rc.issuer),
  });
  if (r.revocationVoided) console.log("ℹ Có một lần thu hồi do khóa đã bị tuyên bố LỘ thực hiện — đã bị vô hiệu.");
  if (r.valid && r.issuedAfterCompromise) {
    console.log("✘ KHÔNG ĐÁNG TIN: lô được đăng SAU mốc khóa của đơn vị bị tuyên bố lộ (mốc lộ =",
      iso(r.compromisedSince) + ", công bố lúc " + iso(r.compromiseDeclaredAt) + "). Liên hệ đơn vị để được cấp lại bằng khóa mới.");
  } else {
    console.log(r.valid ? "✔ HỢP LỆ" : "✘ KHÔNG HỢP LỆ");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
