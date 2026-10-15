// Dựng môi trường cho cả bộ e2e, trả về hàm dọn dẹp (Playwright gọi khi xong):
//  1. node Hardhat chainId 11155111 ở cổng E2E_RPC_PORT (mặc định 8547);
//  2. tái dựng trạng thái Sepolia (seed-chain.ts);
//  3. máy chủ tĩnh tối giản phục vụ app/ (và picture/ cho favicon) ở cổng E2E_WEB_PORT (mặc định 8548);
//  4. kiểm ethers UMD 6.13.2 trong node_modules/ethers-cdn trùng SRI ghi trong app/index.html.
import fs from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import { spawn, ChildProcess } from "child_process";
import { ROOT, RPC_PORT, WEB_PORT, NODE_URL, ETHERS_LOCAL, ETHERS_CDN } from "./env";
import { seedChain } from "./seed-chain";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json",
};

function startStatic(): Promise<http.Server> {
  const allowed = ["app", "picture"].map((d) => path.join(ROOT, d) + path.sep);
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.normalize(path.join(ROOT, url === "/" ? "/app/index.html" : url));
    if (!allowed.some((a) => file.startsWith(a)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end("not found"); return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => { srv.once("error", fail); srv.listen(WEB_PORT, "127.0.0.1", () => ok(srv)); });
}

async function rpcUp(): Promise<boolean> {
  try {
    const r = await fetch(NODE_URL, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }) });
    return r.ok;
  } catch { return false; }
}

function checkEthersSri() {
  const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
  const m = html.match(new RegExp('src="' + ETHERS_CDN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"\\s+integrity="([^"]+)"'));
  if (!m) throw new Error("index.html không còn nạp " + ETHERS_CDN + " — cập nhật env.ts");
  const got = "sha384-" + crypto.createHash("sha384").update(fs.readFileSync(ETHERS_LOCAL)).digest("base64");
  if (got !== m[1]) throw new Error(`ethers-cdn trong node_modules (${got}) khác SRI trang (${m[1]})`);
}

export default async function globalSetup() {
  checkEthersSri();
  if (await rpcUp()) throw new Error(`Cổng ${RPC_PORT} đã có node chạy — dừng nó hoặc đặt E2E_RPC_PORT khác`);

  const cli = path.join(ROOT, "node_modules", "hardhat", "internal", "cli", "cli.js");
  const node: ChildProcess = spawn(process.execPath,
    [cli, "--config", path.join(__dirname, "hardhat.e2e.config.cjs"), "node", "--hostname", "127.0.0.1", "--port", String(RPC_PORT)],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  node.stdout!.on("data", (d) => { if (log.length < 20000) log += d; });
  node.stderr!.on("data", (d) => { log += d; });

  let server: http.Server | null = null;
  const stop = async () => {
    if (server) await new Promise((r) => server!.close(() => r(null)));
    if (node.exitCode === null) node.kill();
  };
  try {
    const t0 = Date.now();
    while (!(await rpcUp())) {
      if (node.exitCode !== null || Date.now() - t0 > 60_000) throw new Error("Không khởi động được node Hardhat:\n" + log);
      await new Promise((r) => setTimeout(r, 300));
    }
    const fx = await seedChain();
    console.log(`[e2e] chuỗi local sẵn sàng: lô ${fx.mode}, root ${fx.root.slice(0, 10)}…, block ${fx.latestBlock}`);
    server = await startStatic();
  } catch (e) {
    await stop();
    throw e;
  }
  return stop;
}
