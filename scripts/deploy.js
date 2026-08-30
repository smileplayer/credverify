// Script triển khai (deploy) CredentialRegistry lên mạng đang cấu hình (mặc định: Hardhat local)
// Chạy: npx hardhat run scripts/deploy.js --network localhost

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Đọc ngược hai hằng số neo tin cậy từ giao diện để đối chiếu.
// Giao diện KHÔNG nhận địa chỉ từ người dùng,
// nên mỗi lần deploy ra địa chỉ mới thì phải cập nhật app/index.html rồi phát hành lại trang.
function readAnchor() {
  try {
    const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
    const addr = html.match(/const CONTRACT_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/);
    const chain = html.match(/const EXPECTED_CHAIN_ID\s*=\s*(\d+)n/);
    return { addr: addr && addr[1], chainId: chain && chain[1] };
  } catch {
    return { addr: null, chainId: null };
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const net = await hre.ethers.provider.getNetwork();

  console.log("Deploying with account:", deployer.address);

  const CredentialRegistry = await hre.ethers.getContractFactory("CredentialRegistry");
  const registry = await CredentialRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("CredentialRegistry deployed to:", address);
  console.log("Network:", hre.network.name, "| chainId:", net.chainId.toString());

  // ---------- Đối chiếu trong giao diện ----------
  const anchor = readAnchor();
  const addrOk = anchor.addr && anchor.addr.toLowerCase() === address.toLowerCase();
  const chainOk = anchor.chainId && anchor.chainId === net.chainId.toString();

  console.log("");
  if (addrOk && chainOk) {
    console.log("✔ app/index.html đã trỏ đúng địa chỉ và đúng mạng. Không cần sửa gì.");
  } else {
    console.log("⚠ CẦN CẬP NHẬT app/index.html trước khi phát hành trang:");
    if (!addrOk) {
      console.log('    const CONTRACT_ADDRESS  = "' + address + '";' +
        (anchor.addr ? "   // hiện đang là " + anchor.addr : ""));
    }
    if (!chainOk) {
      console.log("    const EXPECTED_CHAIN_ID = " + net.chainId.toString() + "n;" +
        (anchor.chainId ? "   // hiện đang là " + anchor.chainId + "n" : ""));
    }
    console.log("");
    console.log("  Giao diện không nhận địa chỉ contract từ người dùng — neo tin cậy nằm ở");
    console.log("  mã nguồn trang, được phục vụ từ tên miền chính thức của đơn vị phát hành.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
