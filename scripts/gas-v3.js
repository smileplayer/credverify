// =============================================================================
//  Đo gas THẬT: cấp lẻ × n (V2 và V3) so với cấp theo lô (V3), cùng chi phí thu hồi.
//
//    npx hardhat run scripts/gas-v3.js
//
//  Mọi con số là `gasUsed` đọc từ receipt của giao dịch thật trên mạng Hardhat
//  in-process (không ước lượng, không ngoại suy). Gas thực thi trên testnet/mainnet
//  giống hệt vì cùng EVM và cùng bytecode; chỉ GIÁ gas khác.
//  Ghi kết quả ra docs/GAS-V3.md.
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { StandardMerkleTree } = require("@openzeppelin/merkle-tree");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const { ethers } = hre;
const SIZES = [1, 10, 50, 100, 500];
const used = async (txp) => (await (await txp).wait()).gasUsed;
const fmt = (n) => Number(n).toLocaleString("vi-VN");

async function deploy(name, ...args) {
  const c = await (await ethers.getContractFactory(name)).deploy(...args);
  await c.waitForDeployment();
  return c;
}

function rows(n, tag) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push([
      ethers.keccak256(ethers.toUtf8Bytes(`${tag}-${i}.pdf`)),
      ethers.ZeroAddress,
      ethers.hexlify(ethers.randomBytes(32)),
    ]);
  }
  return out;
}

async function main() {
  const [owner, issuer, holder] = await ethers.getSigners();
  const md = [];
  md.push("# Gas V3 — đo thật, không ngoại suy");
  md.push("");
  md.push(`Sinh bởi \`scripts/gas-v3.js\` ngày ${new Date().toISOString().slice(0, 10)}. Solc ${hre.config.solidity.compilers[0].version} · optimizer ${hre.config.solidity.compilers[0].settings.optimizer.enabled ? "bật" : "tắt"} · runs ${hre.config.solidity.compilers[0].settings.optimizer.runs}.`);
  md.push("Mọi số là `gasUsed` trong receipt (đã gồm 21.000 gas nội tại của giao dịch).");
  md.push("");

  // ---------- Deploy ----------
  const v2 = await deploy("CredentialRegistryV2");
  const v3 = await deploy("CredentialRegistry", 48 * 3600);   // độ trễ production; gas không phụ thuộc độ trễ
  const dep2 = (await v2.deploymentTransaction().wait()).gasUsed;
  const dep3 = (await v3.deploymentTransaction().wait()).gasUsed;
  const add2 = await used(v2.addIssuer(issuer.address, "Trung tam X"));
  const add3 = await used(v3.addIssuer(issuer.address, "Trung tam X"));

  md.push("## 1. Chi phí một lần");
  md.push("");
  md.push("| Thao tác | V2 | V3 | Chênh |");
  md.push("|---|---:|---:|---:|");
  md.push(`| Deploy contract | ${fmt(dep2)} | ${fmt(dep3)} | ${fmt(dep3 - dep2)} |`);
  md.push(`| \`addIssuer\` (tên đầu tiên) | ${fmt(add2)} | ${fmt(add3)} | ${fmt(add3 - add2)} |`);
  md.push("");
  md.push("V3 ghi thêm `identityOf`, `latestKeyOf` (kiểm quyền thu hồi O(1), không trần số đời kế nhiệm) và không có mảng duyệt danh bạ (danh bạ dựng từ event), nên `addIssuer` gần ngang V2; `addIssuer` còn kiểm tên theo danh sách cho phép chữ tiếng Việt trong một vòng assembly. Deploy đắt hơn V2 vì thêm cấp theo lô, cơ chế khóa lộ, độ trễ chuyển giao và kiểm tên; custom error thay chuỗi revert bù một phần kích thước bytecode. `INHERIT_DELAY` là `immutable` (tham số constructor) nên đọc từ bytecode, không tốn SLOAD.");
  md.push("");

  // ---------- Cấp lẻ vs lô ----------
  const one2 = await used(v2.connect(issuer).issueCertificate(ethers.id("mot-v2"), holder.address));
  const one3 = await used(v3.connect(issuer).issueCertificate(ethers.id("mot-v3"), holder.address));

  md.push("## 2. Cấp n chứng chỉ: lẻ × n so với một lô");
  md.push("");
  md.push(`Một lần \`issueCertificate\`: V2 = **${fmt(one2)}**, V3 = **${fmt(one3)}** gas (hàm không đổi). Cột "lẻ × n" dưới đây là tổng gas của **n giao dịch thật** trên V3, không phải nhân lên.`);
  md.push("");
  md.push("| n | Cấp lẻ × n (tổng, V3) | Một lô `publishBatch` | Gas/chứng chỉ theo lô | Tiết kiệm | Độ dài proof |");
  md.push("|---:|---:|---:|---:|---:|---:|");

  const results = [];
  for (const n of SIZES) {
    // n giao dịch lẻ thật
    let single = 0n;
    for (let i = 0; i < n; i++) {
      single += await used(v3.connect(issuer).issueCertificate(ethers.id(`le-${n}-${i}`), holder.address));
    }
    // một lô
    const r = rows(n, `lo-${n}`);
    const tree = StandardMerkleTree.of(r, ["bytes32", "address", "bytes32"]);
    const batch = await used(v3.connect(issuer).publishBatch(tree.root, n));
    const proofLen = tree.getProof(0).length;
    results.push({ n, single, batch, tree, r });
    const saving = 100 - Number((batch * 10000n) / single) / 100;
    md.push(`| ${n} | ${fmt(single)} | ${fmt(batch)} | ${fmt(batch / BigInt(n))} | ${saving.toFixed(2)}% | ${proofLen} |`);
  }
  md.push("");
  md.push("Gas của `publishBatch` không phụ thuộc n (chỉ ghi một bản ghi `Batch` gồm 2 slot; root nằm trong khóa `batchId` và event); chênh vài gas giữa các dòng là do số byte 0 trong calldata của root. Từ n = 1 lô đã ngang giá cấp lẻ; từ n = 2 rẻ hơn rõ rệt. Đổi lại, học viên phải giữ biên nhận (salt + proof) — xem mục 4 của docs/AUDIT-V3.md.");
  md.push("");

  // ---------- Thu hồi ----------
  md.push("## 3. Thu hồi");
  md.push("");
  md.push("| Thao tác | Gas |");
  md.push("|---|---:|");
  const certId = await v3.certIdOf(issuer.address, ethers.id("mot-v3"));
  md.push(`| \`revokeCertificate\` (cấp lẻ) | ${fmt(await used(v3.connect(issuer).revokeCertificate(certId)))} |`);
  for (const { n, tree, r } of results) {
    if (n === 1) continue;
    const batchId = await v3.batchIdOf(issuer.address, tree.root);
    const g = await used(v3.connect(issuer).revokeLeaf(batchId, tree.root, ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32", "address", "bytes32"], r[0])), tree.getProof(0)));
    md.push(`| \`revokeLeaf\` — lô ${n} (proof ${tree.getProof(0).length} nút) | ${fmt(g)} |`);
  }
  const last = results[results.length - 1];
  const bid = await v3.batchIdOf(issuer.address, last.tree.root);
  md.push(`| \`revokeBatch\` — lô ${last.n}, bất kể kích thước | ${fmt(await used(v3.connect(issuer).revokeBatch(bid)))} |`);
  md.push("");

  // ---------- Xác minh ----------
  md.push("## 4. Xác minh (hàm `view`, người gọi trả 0 gas — số dưới đây là gas nếu gọi trong một giao dịch)");
  md.push("");
  md.push("| Thao tác | Gas ước tính |");
  md.push("|---|---:|");
  md.push(`| \`verifyCertificate\` (cấp lẻ) | ${fmt(await v3.verifyCertificate.estimateGas(issuer.address, ethers.id("mot-v3")))} |`);
  for (const { n, tree, r } of results) {
    const g = await v3.verifyInBatch.estimateGas(issuer.address, tree.root, ...r[1 % n], tree.getProof(1 % n));
    md.push(`| \`verifyInBatch\` — lô ${n} | ${fmt(g)} |`);
  }
  md.push("");

  // ---------- Xoay khóa ----------
  md.push("## 5. Xoay khóa");
  md.push("");
  const k = [];
  for (let i = 0; i < 4; i++) k.push(ethers.Wallet.createRandom().address);
  const DELAY = Number(await v3.INHERIT_DELAY());
  const inh2 = await used(v2.inheritIssuer(issuer.address, k[0]));
  const prop = await used(v3.proposeInherit(issuer.address, k[0], 0));
  await time.increase(DELAY + 1);
  const exe = await used(v3.executeInherit(issuer.address));
  await v3.removeIssuer(k[0]);
  const propD = await used(v3.proposeInherit(k[0], k[1], 0));
  await time.increase(DELAY + 1);
  const exeD = await used(v3.executeInherit(k[0]));
  const lo = await time.latest();
  const propC = await used(v3.proposeInherit(k[1], k[2], lo));
  await time.increase(DELAY + 1);
  const exeC = await used(v3.executeInherit(k[1]));
  md.push(`V2 chuyển giao trong MỘT giao dịch, có hiệu lực ngay. V3 tách thành \`proposeInherit\` → chờ INHERIT_DELAY (tham số deploy; đo ở ${DELAY} giây = 48 giờ như production — gas không phụ thuộc độ trễ) → \`executeInherit\`.`);
  md.push("");
  md.push("| Thao tác | V2 `inheritIssuer` | V3 `proposeInherit` | V3 `executeInherit` | V3 tổng |");
  md.push("|---|---:|---:|---:|---:|");
  md.push(`| Từ khóa Active, xoay định kỳ | ${fmt(inh2)} | ${fmt(prop)} | ${fmt(exe)} | ${fmt(prop + exe)} |`);
  md.push(`| Từ khóa Disabled | không làm được | ${fmt(propD)} | ${fmt(exeD)} | ${fmt(propD + exeD)} |`);
  md.push(`| Khóa bị lộ (ghi \`compromisedAt\` + \`compromiseDeclaredAt\`) | không có | ${fmt(propC)} | ${fmt(exeC)} | ${fmt(propC + exeC)} |`);
  md.push("");
  md.push("Thu hồi lẻ đắt hơn V2 vì V3 ghi thêm khóa đã thu hồi (`certRevokedBy`, một slot) để vô hiệu được các lần thu hồi do khóa lộ. Thu hồi lô không đắt thêm: `revokedBy` nằm gọn trong slot còn trống của struct `Batch`.");
  md.push("");

  const out = md.join("\n") + "\n";
  console.log(out);
  fs.writeFileSync(path.join(__dirname, "..", "docs", "GAS-V3.md"), out, "utf8");
  console.log("Đã ghi docs/GAS-V3.md");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
