// Script triển khai (deploy) CredentialRegistry lên mạng đang cấu hình (mặc định: Hardhat local)
// Chạy: npx hardhat run scripts/deploy.js --network localhost
// Độ trễ chuyển giao (INHERIT_DELAY) là tham số constructor. Mặc định 48 giờ; bản demo đặt
//   INHERIT_DELAY_SECONDS=60 (hoặc 3600) trong .env. Mạng không phải local/testnet: tối thiểu 24 giờ.

const hre = require("hardhat");
const { readAnchor } = require("./lib/anchor");
const { resolveInheritDelay, humanDelay } = require("./lib/delay");

// Giao diện KHÔNG nhận địa chỉ từ người dùng, nên mỗi lần deploy ra địa chỉ mới thì phải
// cập nhật ba hằng số neo trong app/app.js rồi phát hành lại trang
// (khi phát hành: node scripts/page-integrity.js --release để gắn lại SRI).

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = await hre.ethers.provider.getNetwork();

  console.log("Deploying with account:", deployer.address);
  const delay = resolveInheritDelay(process.env.INHERIT_DELAY_SECONDS, net.chainId);
  console.log("INHERIT_DELAY:", delay, "giây (" + humanDelay(delay) + ") — BẤT BIẾN sau khi deploy");

  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await CredentialRegistry.deploy(delay);
  await registry.waitForDeployment();
  const rc = await registry.deploymentTransaction().wait();

  const address = await registry.getAddress();
  console.log("CredentialRegistry deployed to:", address);
  console.log("Network:", hre.network.name, "| chainId:", net.chainId.toString(), "| block:", rc.blockNumber);
  console.log("INHERIT_DELAY trên chuỗi:", (await registry.INHERIT_DELAY()).toString(), "giây");

  // ---------- Đối chiếu trong giao diện ----------
  const anchor = readAnchor();
  const addrOk = anchor.addr && anchor.addr.toLowerCase() === address.toLowerCase();
  const chainOk = anchor.chainId && anchor.chainId === net.chainId.toString();
  // Trên mạng local, DEPLOY_BLOCK nhỏ hơn block thật vẫn đúng (chỉ quét thừa vài block).
  const blockOk = anchor.deployBlock !== null && (anchor.deployBlock === String(rc.blockNumber) ||
    (net.chainId === 31337n && Number(anchor.deployBlock) <= rc.blockNumber));

  console.log("");
  if (addrOk && chainOk && blockOk) {
    console.log("✔ app/app.js đã trỏ đúng địa chỉ, đúng mạng, đúng block deploy. Không cần sửa gì.");
  } else {
    console.log("⚠ CẦN CẬP NHẬT app/app.js trước khi phát hành trang:");
    if (!addrOk) {
      console.log('    const CONTRACT_ADDRESS  = "' + address + '";' +
        (anchor.addr ? "   // hiện đang là " + anchor.addr : ""));
    }
    if (!chainOk) {
      console.log("    const EXPECTED_CHAIN_ID = " + net.chainId.toString() + "n;" +
        (anchor.chainId ? "   // hiện đang là " + anchor.chainId + "n" : ""));
    }
    if (!blockOk) {
      console.log("    const DEPLOY_BLOCK = " + rc.blockNumber + ";" +
        (anchor.deployBlock ? "   // hiện đang là " + anchor.deployBlock : ""));
    }
    console.log("");
    console.log("  Giao diện không nhận địa chỉ contract từ người dùng — neo tin cậy nằm ở");
    console.log("  mã nguồn trang, được phục vụ từ tên miền chính thức của đơn vị phát hành.");
    console.log("  DEPLOY_BLOCK sai (quá lớn) làm trang bỏ sót event; để 0 trên testnet làm trang");
    console.log("  quét hàng triệu block và bị RPC chặn.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
