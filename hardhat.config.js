// Nạp .env nếu có. Bọc try/catch để repo vẫn chạy được khi chưa `npm i -D dotenv`
try { require("dotenv").config(); } catch { }

require("@nomicfoundation/hardhat-toolbox");

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",

    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },

  networks: {
    // Mạng local mặc định của `npx hardhat node`.
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    // Testnet công khai
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },

  // Etherscan API V2: MỘT khóa dạng chuỗi dùng cho mọi mạng. Dạng { sepolia: "…" } là API V1 đã ngừng.
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== "false",
    noColors: true,
  },
};
