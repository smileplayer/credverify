// Đọc ba hằng số neo tin cậy từ mã giao diện (app/app.js) để các script đối chiếu.
const fs = require("fs");
const path = require("path");

function readAnchor() {
  try {
    const src = fs.readFileSync(path.join(__dirname, "..", "..", "app", "app.js"), "utf8");
    const addr = src.match(/const CONTRACT_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/);
    const chain = src.match(/const EXPECTED_CHAIN_ID\s*=\s*(\d+)n/);
    const block = src.match(/const DEPLOY_BLOCK\s*=\s*(\d+)/);
    return { addr: addr && addr[1], chainId: chain && chain[1], deployBlock: block && block[1] };
  } catch {
    return { addr: null, chainId: null, deployBlock: null };
  }
}

module.exports = { readAnchor };
