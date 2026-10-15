// Hằng dùng chung của bộ e2e.
import path from "path";

export const ROOT = path.join(__dirname, "..", "..");
export const TMP = path.join(__dirname, ".tmp");
export const FIXTURE = path.join(TMP, "fixture.json");

// Không dùng 8545: phiên khác có thể đang chạy `npx hardhat node`.
export const RPC_PORT = Number(process.env.E2E_RPC_PORT || 8547);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT || 8548);
export const NODE_URL = `http://127.0.0.1:${RPC_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

// Bản đang chạy trên Sepolia (docs/sepolia-evidence.md).
export const SEPOLIA = {
  chainId: 11155111,
  contract: "0x672e08DBF5Ce118a235E36C235b53Fa251dDe7F6",
  deployBlock: 11890480,
  owner: "0x103E419e5e9fB70a55F66dF261661ACf498Ee2dA",
  issuer: "0x4B89a5fEa7727707b2Db99298Ba8AE59FCb2727A",
  holder: "0xCf422cb92CcE4A922F80785DeD766F357744aB0F",
  issuerName: "Trung tam dao tao Demo",
  inheritDelay: 60,
};

// Ba RPC trong RPC_URLS của app/app.js — Playwright chặn và chuyển về node local.
export const TENDERLY = "https://sepolia.gateway.tenderly.co";
export const PUBLICNODE = "https://ethereum-sepolia-rpc.publicnode.com";
export const DRPC = "https://sepolia.drpc.org";
export const RPC_ORIGINS = [TENDERLY, PUBLICNODE, DRPC];
export const ETHERS_CDN = "https://cdn.jsdelivr.net/npm/ethers@6.13.2/dist/ethers.umd.min.js";
export const ETHERS_LOCAL = path.join(ROOT, "node_modules", "ethers-cdn", "dist", "ethers.umd.min.js");

// Nội dung tệp demo — đúng từng byte như scripts/seed-sepolia.js.
export const REVOKED_SINGLE_TEXT = "CredVerify demo — chung chi se bi thu hoi";
export const loDemoText = (i: number) => `CredVerify lo demo #${i} ${SEPOLIA.contract}`;
