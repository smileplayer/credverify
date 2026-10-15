// Chặn mạng của trang: 3 origin trong RPC_URLS chuyển về node local (kèm chế độ lỗi theo từng
// origin), CDN ethers phục vụ từ node_modules/ethers-cdn, mọi request ra ngoài khác bị chặn.
// Đồng thời gom lỗi console và vi phạm CSP để ca kiểm khẳng định "0".
import fs from "fs";
import { test as base, Page, Route } from "@playwright/test";
import { NODE_URL, RPC_ORIGINS, ETHERS_CDN, ETHERS_LOCAL, WEB_URL } from "./env";

/** Chế độ lỗi cho MỘT origin RPC. */
export type Fault =
  | { kind: "dead" }                              // không trả lời (abort kết nối)
  | { kind: "pruned" }                            // eth_getLogs → 4444 "pruned history unavailable" (publicnode)
  | { kind: "getLogsError" }                      // eth_getLogs → lỗi chung, không phải lỗi giới hạn khoảng
  | { kind: "rangeLimit"; maxBlocks: number };    // eth_getLogs > maxBlocks → lỗi kiểu dRPC gói miễn phí

export type LogCall = { origin: string; fromBlock: number; toBlock: number; ok: boolean };

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const ETHERS_JS = fs.readFileSync(ETHERS_LOCAL);

async function forward(body: unknown) {
  const r = await fetch(NODE_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

export class Net {
  faults: Record<string, Fault> = {};
  logCalls: LogCall[] = [];
  blocked: string[] = [];
  consoleErrors: string[] = [];
  appJsOverride: string | null = null;

  constructor(private page: Page) {}

  async install() {
    const page = this.page;
    // Bắt vi phạm CSP ngay từ đầu tài liệu (init script không chịu CSP của trang).
    await page.addInitScript(() => {
      (window as any).__csp = [];
      document.addEventListener("securitypolicyviolation", (e: any) =>
        (window as any).__csp.push(e.violatedDirective + " " + e.blockedURI));
    });
    page.on("console", (m) => { if (m.type() === "error") this.consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => this.consoleErrors.push("pageerror: " + e.message));

    await page.route("**/*", (route) => this.handle(route));
  }

  private async handle(route: Route) {
    const req = route.request();
    const url = req.url();
    const origin = RPC_ORIGINS.find((o) => url === o || url.startsWith(o + "/"));
    if (origin) return this.rpc(route, origin);
    if (url === ETHERS_CDN) {
      return route.fulfill({ status: 200, body: ETHERS_JS, headers: { ...CORS, "content-type": "application/javascript" } });
    }
    if (url.startsWith(WEB_URL + "/")) {
      if (this.appJsOverride !== null && new URL(url).pathname === "/app/app.js") {
        return route.fulfill({ status: 200, body: this.appJsOverride, headers: { "content-type": "application/javascript" } });
      }
      return route.continue();
    }
    this.blocked.push(url);   // không để trang ra Internet thật
    return route.abort("blockedbyclient");
  }

  private async rpc(route: Route, origin: string) {
    const req = route.request();
    const fault = this.faults[origin];
    if (fault?.kind === "dead") return route.abort("connectionrefused");
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const body = req.postDataJSON();
    const one = async (m: any) => {
      if (m.method === "eth_getLogs") {
        const f = m.params?.[0] || {};
        const from = parseInt(f.fromBlock, 16), to = parseInt(f.toBlock, 16);
        const err = (code: number, message: string) => {
          this.logCalls.push({ origin, fromBlock: from, toBlock: to, ok: false });
          return { jsonrpc: "2.0", id: m.id, error: { code, message } };
        };
        if (fault?.kind === "pruned") return err(4444, "pruned history unavailable");
        if (fault?.kind === "getLogsError") return err(-32000, "internal error");
        if (fault?.kind === "rangeLimit" && to - from + 1 > fault.maxBlocks) {
          return err(35, "ranges over 10000 blocks are not supported on free plan");
        }
        this.logCalls.push({ origin, fromBlock: from, toBlock: to, ok: true });
      }
      return forward(m);
    };
    const out = Array.isArray(body) ? await Promise.all(body.map(one)) : await one(body);
    return route.fulfill({ status: 200, body: JSON.stringify(out), headers: { ...CORS, "content-type": "application/json" } });
  }

  async cspViolations(): Promise<string[]> {
    return this.page.evaluate(() => (window as any).__csp || []);
  }
}

export const test = base.extend<{ net: Net }>({
  net: async ({ page }, use) => {
    const n = new Net(page);
    await n.install();
    await use(n);
  },
});
export { expect } from "@playwright/test";
