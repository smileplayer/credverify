// Cấu hình Hardhat RIÊNG cho e2e: node local mang chainId của Sepolia (11155111) để trang
// chạy đúng bản phát hành (EXPECTED_CHAIN_ID = 11155111n) mà không sửa app/app.js.
// Dùng:  node node_modules/hardhat/internal/cli/cli.js --config test/e2e/hardhat.e2e.config.cjs node --port 8547
// Tệp này nằm trong test/ nên `npx hardhat test` cũng nạp nó — chỉ export object, không tác dụng phụ.
const path = require("path");

module.exports = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: { hardhat: { chainId: 11155111 } },
  paths: { root: path.join(__dirname, "..", "..") },
};
