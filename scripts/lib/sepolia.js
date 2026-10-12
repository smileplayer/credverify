// Mục "2b" của EVIDENCE.md: tóm tắt bản triển khai trên Sepolia, đọc từ docs/sepolia-evidence.md
// (tệp do scripts/seed-sepolia.js sinh). Không có tệp đó thì trả chuỗi rỗng.
const fs = require("fs");
const path = require("path");

function sepoliaSection(file = path.join(__dirname, "..", "..", "docs", "sepolia-evidence.md")) {
  if (!fs.existsSync(file)) return "";
  const s = fs.readFileSync(file, "utf8");
  const get = (re) => (s.match(re) || [])[1];
  const addr = get(/\| Contract address \| `(0x[0-9a-fA-F]{40})` \|/);
  const chain = get(/\| Chain ID \| `(\d+)` \|/);
  const block = get(/\| Block deploy \(DEPLOY_BLOCK\) \| (\d+) \|/);
  const delay = get(/\| INHERIT_DELAY \(bất biến\) \| (\d+) giây/);
  const deployGas = get(/\| 1 \| Deploy CredentialRegistry \| `0x[0-9a-f]+` \| \d+ \| (\d+) \|/);
  if (!addr || !chain || !block) return "";
  let md = "## 2b. Bản triển khai trên testnet công khai (Sepolia)\n\n";
  md += "Giao diện trong repo (`app/app.js`) neo vào bản này. Chi tiết từng giao dịch: `docs/sepolia-evidence.md`.\n\n";
  md += "| Hạng mục | Giá trị |\n|---|---|\n";
  md += "| Chain ID | `" + chain + "` |\n";
  md += "| Contract address | [`" + addr + "`](https://sepolia.etherscan.io/address/" + addr + "#code) — mã nguồn đã xác minh trên Etherscan |\n";
  md += "| Block deploy (`DEPLOY_BLOCK`) | `" + block + "` |\n";
  if (delay) md += "| `INHERIT_DELAY` | `" + delay + "` giây — cấu hình demo; production 48 giờ |\n";
  if (deployGas) md += "| Gas deploy trên Sepolia | `" + deployGas + "` (luật Glamsterdam, xem dưới) |\n";
  md += "| RPC của giao diện | hai RPC công cộng độc lập, không khóa API (`RPC_URLS` trong `app/app.js`) |\n\n";
  md += "**Gas trên Sepolia khác Mục 9.2.** Sepolia bật nâng cấp Glamsterdam ngày 06/10/2026; EIP-8037 trong đó tính ";
  md += "giá tạo state mới (bytecode, ô storage, tài khoản) khoảng 1.530 gas mỗi byte, nên deploy đắt khoảng 7 lần và các ";
  md += "thao tác ghi đắt 2,4–4,1 lần. Mainnet chưa có ngày kích hoạt; Mục 9.2 đo trên Hardhat (hardfork Osaka) — ";
  md += "luật mainnet hiện hành. Bảng đối chiếu từng thao tác ở cuối `docs/sepolia-evidence.md`.\n\n";
  return md;
}

module.exports = { sepoliaSection };
