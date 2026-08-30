// =============================================================================
//  Dựng bằng chứng công khai trên testnet bằng MỘT lệnh.
//
//    npx hardhat run scripts/seed-sepolia.js --network sepolia
//
//  KHÔNG dùng scripts/collect-evidence.js cho testnet: nó chạy ~30 giao dịch và đo
//  độ trễ 30 mẫu mỗi thao tác đọc. Trên mạng thật thì vừa tốn ETH thử nghiệm, vừa
//  mất rất lâu vì phải chờ block. Số đo độ trễ nên lấy ở local, còn testnet chỉ để
//  chứng minh "chạy thật trên mạng công khai".
//
//  Chuẩn bị trước:
//    1. npm i -D dotenv
//    2. cp .env.example .env  rồi điền SEPOLIA_PRIVATE_KEY và SEPOLIA_RPC_URL
//    3. Ví deploy cần khoảng 0,05 ETH thử nghiệm (faucet ghi trong .env.example)
// =============================================================================

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORER = { 11155111: "https://sepolia.etherscan.io" };

function link(chainId, kind, value) {
  const base = EXPLORER[Number(chainId)];
  return base ? `${base}/${kind}/${value}` : value;
}

async function main() {
  const net = await hre.ethers.provider.getNetwork();
  const chainId = Number(net.chainId);

  if (chainId === 31337) {
    console.log("⚠ Đang chạy trên mạng local. Script này dành cho testnet công khai.");
    console.log("  Chạy lại với:  npx hardhat run scripts/seed-sepolia.js --network sepolia\n");
  }

  const signers = await hre.ethers.getSigners();
  if (!signers.length) {
    throw new Error(
      "Không có tài khoản nào. Kiểm tra SEPOLIA_PRIVATE_KEY trong .env, " +
      "và nhớ `npm i -D dotenv`."
    );
  }
  const owner = signers[0];
  const bal = await hre.ethers.provider.getBalance(owner.address);
  console.log("Ví deploy :", owner.address);
  console.log("Số dư     :", hre.ethers.formatEther(bal), "ETH");
  if (bal === 0n) throw new Error("Ví không có ETH. Lấy ở faucet trước — xem .env.example.");

  // Ví đơn vị phát hành.
  let issuerWallet;
  if (process.env.DEMO_ISSUER_PRIVATE_KEY) {
    issuerWallet = new hre.ethers.Wallet(process.env.DEMO_ISSUER_PRIVATE_KEY, hre.ethers.provider);
    console.log("Ví issuer : ", issuerWallet.address, "(lấy từ .env)");
  } else {
    issuerWallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
    console.log("Ví issuer : ", issuerWallet.address, "(sinh mới)");
    console.log("  khóa riêng:", issuerWallet.privateKey);
    console.log("  ^ Ví DEMO trên testnet. Lưu vào .env nếu muốn dùng lại.");
    console.log("    TUYỆT ĐỐI KHÔNG commit khóa này vào repo.");
  }
  const holder = process.env.DEMO_HOLDER_ADDRESS || hre.ethers.Wallet.createRandom().address;
  console.log("Ví học viên:", holder);
  console.log("");

  const out = [];
  const step = async (label, txPromise) => {
    const tx = await txPromise;
    const rc = await tx.wait();
    out.push({ label, hash: rc.hash, block: rc.blockNumber, gas: rc.gasUsed.toString() });
    console.log(`✔ ${label}\n    tx ${rc.hash}  |  block ${rc.blockNumber}  |  gas ${rc.gasUsed}`);
    return rc;
  };

  // ---------- 1. Deploy ----------
  console.log("→ Đang deploy…");
  const Factory = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await Factory.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();
  const deployRc = await registry.deploymentTransaction().wait();
  out.push({ label: "Deploy CredentialRegistry", hash: deployRc.hash,
             block: deployRc.blockNumber, gas: deployRc.gasUsed.toString() });
  console.log(`✔ Deploy\n    ${address}\n    tx ${deployRc.hash}  |  block ${deployRc.blockNumber}  |  gas ${deployRc.gasUsed}`);

  // ---------- 2. Nạp ETH cho ví issuer ----------
  console.log("\n→ Nạp ETH cho ví issuer để nó tự ký được giao dịch…");
  await step("Chuyển 0,01 ETH sang ví issuer",
    owner.sendTransaction({ to: issuerWallet.address, value: hre.ethers.parseEther("0.01") }));

  // ---------- 3. Công nhận đơn vị phát hành ----------
  await step('addIssuer — owner công nhận "Trung tam dao tao Demo"',
    registry.connect(owner).addIssuer(issuerWallet.address, "Trung tam dao tao Demo"));

  // ---------- 4. Cấp chứng chỉ ----------
  const pdfPath = path.join(__dirname, "..", "Demo", "DemoCert.pdf");
  if (!fs.existsSync(pdfPath)) throw new Error("Không tìm thấy " + pdfPath);
  const hashValid = hre.ethers.keccak256(fs.readFileSync(pdfPath));
  await step("issueCertificate — cấp chứng chỉ CÒN HIỆU LỰC",
    registry.connect(issuerWallet).issueCertificate(hashValid, holder));

  // ---------- 5. Cấp rồi thu hồi một chứng chỉ thứ hai ----------
  const hashRevoked = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("CredVerify demo — chung chi se bi thu hoi"));
  await step("issueCertificate — cấp chứng chỉ thứ hai",
    registry.connect(issuerWallet).issueCertificate(hashRevoked, holder));
  const certIdRevoked = await registry.certIdOf(issuerWallet.address, hashRevoked);
  await step("revokeCertificate — thu hồi chứng chỉ thứ hai",
    registry.connect(issuerWallet).revokeCertificate(certIdRevoked));

  // ---------- Đối chiếu trạng thái cuối ----------
  const v1 = await registry.verifyCertificate(issuerWallet.address, hashValid);
  const v2 = await registry.verifyCertificate(issuerWallet.address, hashRevoked);

  // ---------- In khối markdown dán thẳng vào EVIDENCE.md ----------
  const md = [];
  md.push("");
  md.push("### Bằng chứng trên testnet công khai");
  md.push("");
  md.push("| Hạng mục | Giá trị |");
  md.push("|---|---|");
  md.push(`| Mạng | ${hre.network.name} |`);
  md.push(`| Chain ID | \`${chainId}\` |`);
  md.push(`| Contract address | \`${address}\` |`);
  md.push(`| Xem trên explorer | ${link(chainId, "address", address)} |`);
  md.push(`| Ví owner (CredVerify) | \`${owner.address}\` |`);
  md.push(`| Ví đơn vị phát hành | \`${issuerWallet.address}\` |`);
  md.push(`| Ví học viên | \`${holder}\` |`);
  md.push("");
  md.push("| # | Thao tác | Tx hash | Block | Gas |");
  md.push("|---|---|---|---|---|");
  out.forEach((r, i) => md.push(`| ${i + 1} | ${r.label} | \`${r.hash}\` | ${r.block} | ${r.gas} |`));
  md.push("");
  md.push("Trạng thái đọc lại từ chuỗi công khai sau khi chạy xong:");
  md.push("");
  md.push("| Bản ghi | valid | status | Đơn vị cấp |");
  md.push("|---|---|---|---|");
  md.push(`| Chứng chỉ 1 (\`Demo/DemoCert.pdf\`) | ${v1.valid} | ${Number(v1.status)} (Issued) | ${v1.issuerDisplayName} |`);
  md.push(`| Chứng chỉ 2 (đã thu hồi) | ${v2.valid} | ${Number(v2.status)} (Revoked) | ${v2.issuerDisplayName} |`);
  md.push("");
  md.push("**Cập nhật `app/index.html` trước khi phát hành trang:**");
  md.push("");
  md.push("```js");
  md.push(`const CONTRACT_ADDRESS  = "${address}";`);
  md.push(`const EXPECTED_CHAIN_ID = ${chainId}n;`);
  md.push(`const RPC_URL = "${process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com"}";`);
  md.push("```");
  md.push("");
  console.log(md.join("\n"));

  const outPath = path.join(__dirname, "..", "docs", "sepolia-evidence.md");
  fs.writeFileSync(outPath, md.slice(4).join("\n"), "utf8");
  console.log("Đã ghi thêm vào:", outPath);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
