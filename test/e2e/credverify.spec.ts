// e2e trên Chromium: bản phát hành trong app/ (CSP + SRI, hằng neo Sepolia) đọc node local tái dựng
// đúng trạng thái Sepolia (global-setup.ts + seed-chain.ts). Ba RPC trong RPC_URLS bị chặn và chuyển
// về node local (rpc.ts), có thể giả lập lỗi theo từng RPC.
import fs from "fs";
import path from "path";
import { Page } from "@playwright/test";
import { test, expect, Net } from "./rpc";
import { ROOT, FIXTURE, SEPOLIA, TENDERLY, PUBLICNODE, DRPC, REVOKED_SINGLE_TEXT, loDemoText } from "./env";
import type { Fixture } from "./seed-chain";

const fx = (): Fixture => JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const DEMO_PDF = path.join(ROOT, "Demo", "DemoCert.pdf");
const DEMO2_PDF = path.join(ROOT, "Demo", "DemoCert2.pdf");
const textFile = (name: string, s: string) => ({ name, mimeType: "text/plain", buffer: Buffer.from(s) });
const verdict = (page: Page) => page.locator("#verifyOut .verdict h3");

async function open(page: Page, waitDirectory = true) {
  await page.goto("/app/index.html");
  await expect(page.locator("#anchorAddr")).toHaveText(SEPOLIA.contract);
  if (waitDirectory) {
    await expect(page.locator(`#vfIssuer option[value="${SEPOLIA.issuer}"]`)).toHaveCount(1);
  }
}

async function chooseFile(page: Page, file: string | ReturnType<typeof textFile>) {
  await page.locator("#vfFile").setInputFiles(file);
  await expect(page.locator("#vfHashOut")).toContainText("Hash tệp");
}

async function verifySingle(page: Page, file: string | ReturnType<typeof textFile>) {
  await chooseFile(page, file);
  await page.locator("#vfIssuer").selectOption(SEPOLIA.issuer);
  await page.locator("#btnVerify").click();
  await expect(verdict(page)).toBeVisible();
}

async function verifyBatch(page: Page, file: string | ReturnType<typeof textFile>, receipt: string | ReturnType<typeof textFile>) {
  await chooseFile(page, file);
  await page.locator("#vfReceipt").setInputFiles(receipt);
  await expect(page.locator("#vfReceiptOut")).toContainText("proof");
  await page.locator("#btnVerify").click();
}

async function openDirectory(page: Page) {
  await page.locator('nav button[data-tab="directory"]').click();
  await expect(page.locator("#dirOut")).not.toBeEmpty();
}

/** Luồng đọc bình thường: cấp lẻ, lô, danh bạ — dùng cho các ca "0 vi phạm / 0 lỗi". */
async function normalFlow(page: Page) {
  await open(page);
  await verifySingle(page, DEMO_PDF);
  await expect(verdict(page)).toHaveText("Chứng chỉ hợp lệ");
  await verifyBatch(page, DEMO2_PDF, fx().receipts["DemoCert2.pdf"]);
  await expect(verdict(page)).toHaveText("Chứng chỉ hợp lệ (cấp theo lô)");
  await openDirectory(page);
  await expect(page.locator("#dirOut")).toContainText(SEPOLIA.issuerName);
}

test.describe("Tải trang và hằng neo", () => {
  test("01 app.js chạy dưới SRI (trang khởi động, không lỗi integrity)", async ({ page, net }) => {
    await open(page);
    expect(net.consoleErrors.filter((e) => /integrity/i.test(e))).toEqual([]);
  });

  test("02 hằng neo hiển thị đúng địa chỉ và chainId Sepolia", async ({ page, net }) => {
    await open(page, false);
    await expect(page.locator("#anchorAddr")).toHaveText(SEPOLIA.contract);
    await expect(page.locator("#anchorChain")).toHaveText(String(SEPOLIA.chainId));
  });

  test('03 độ trễ chuyển giao đọc từ hợp đồng: "1 phút"', async ({ page, net }) => {
    await open(page);
    await expect(page.locator(".delayText").first()).toHaveText("1 phút");
    const all = await page.locator(".delayText").allTextContents();
    expect(all.every((t) => t === "1 phút")).toBe(true);
  });

  test("17 ethers UMD nạp đúng bản 6.13.2 qua SRI", async ({ page, net }) => {
    await open(page, false);
    expect(await page.evaluate(() => (window as any).ethers?.version)).toBe("6.13.2");
  });
});

test.describe("Xác minh cấp lẻ", () => {
  test("04 DemoCert.pdf → Hợp lệ, 3 RPC cùng kết quả", async ({ page, net }) => {
    await open(page);
    await verifySingle(page, DEMO_PDF);
    await expect(verdict(page)).toHaveText("Chứng chỉ hợp lệ");
    await expect(page.locator("#verifyOut")).toContainText("3 RPC độc lập trả cùng một kết quả");
    await expect(page.locator("#verifyOut")).toContainText(SEPOLIA.issuerName);
  });

  test("05 chứng chỉ lẻ đã thu hồi → Đã bị thu hồi", async ({ page, net }) => {
    await open(page);
    await verifySingle(page, textFile("chung-chi-le-da-thu-hoi.txt", REVOKED_SINGLE_TEXT));
    await expect(verdict(page)).toHaveText("Đã bị thu hồi");
  });

  test("06 tra theo tên gõ tay (khoảng trắng thừa được gộp) → Hợp lệ", async ({ page, net }) => {
    await open(page);
    await chooseFile(page, DEMO_PDF);
    await page.locator("#vfIssuerName").fill("  Trung tam   dao tao  Demo ");
    await page.locator("#btnVerify").click();
    await expect(verdict(page)).toHaveText("Chứng chỉ hợp lệ");
    await expect(page.locator("#verifyOut")).toContainText("Tra theo tên " + SEPOLIA.issuerName);
  });
});

test.describe("Xác minh theo lô (biên nhận)", () => {
  test("07 DemoCert2.pdf + biên nhận → Hợp lệ (cấp theo lô)", async ({ page, net }) => {
    await open(page);
    await verifyBatch(page, DEMO2_PDF, fx().receipts["DemoCert2.pdf"]);
    await expect(verdict(page)).toHaveText("Chứng chỉ hợp lệ (cấp theo lô)");
    await expect(page.locator("#verifyOut")).toContainText("3 RPC độc lập trả cùng một kết quả");
  });

  test("08 lo-demo-3.txt (lá đã thu hồi) → Đã bị thu hồi", async ({ page, net }) => {
    await open(page);
    await verifyBatch(page, textFile("lo-demo-3.txt", loDemoText(3)), fx().receipts["lo-demo-3.txt"]);
    await expect(verdict(page)).toHaveText("Đã bị thu hồi");
  });

  test("09 tệp bị sửa + biên nhận đúng → Tệp không khớp biên nhận", async ({ page, net }) => {
    await open(page);
    await verifyBatch(page, textFile("lo-demo-1.txt", loDemoText(1) + " "), fx().receipts["lo-demo-1.txt"]);
    await expect(verdict(page)).toHaveText("Tệp không khớp biên nhận");
  });

  test("10 biên nhận sửa chainId → Biên nhận thuộc mạng khác", async ({ page, net }) => {
    await open(page);
    const rc = JSON.parse(fs.readFileSync(fx().receipts["DemoCert2.pdf"], "utf8"));
    rc.chainId = "1";
    await verifyBatch(page, DEMO2_PDF, { name: "gia.receipt.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(rc)) });
    await expect(page.locator("#verifyOut")).toContainText("Biên nhận thuộc mạng khác");
    await expect(page.locator("#verifyOut .verdict")).toHaveCount(0);
  });
});

test.describe("Chứng chỉ của tôi", () => {
  async function openMine(page: Page, addr: string) {
    await open(page);
    await page.locator('nav button[data-tab="mine"]').click();
    await page.locator("#mineAddr").fill(addr);
    await page.locator("#btnRefreshMine").click();
    await expect(page.locator("#mineOut [data-mine-batch-note]")).toBeVisible();
  }
  test("20 ví học viên cấp lẻ → bảng 2 chứng chỉ + ghi chú chứng chỉ lô cần biên nhận", async ({ page, net }) => {
    await openMine(page, SEPOLIA.holder);
    await expect(page.locator("#mineOut tbody tr")).toHaveCount(2);
    await expect(page.locator("#mineOut [data-mine-batch-note]")).toContainText("tab Xác minh");
  });
  test('21 ví không có chứng chỉ lẻ → không ghi "chưa được cấp chứng chỉ nào", chỉ cách kiểm chứng chỉ lô', async ({ page, net }) => {
    await openMine(page, "0x000000000000000000000000000000000000dEaD");
    await expect(page.locator("#mineOut")).toContainText("chưa có chứng chỉ cấp lẻ nào");
    await expect(page.locator("#mineOut")).not.toContainText("chưa được cấp chứng chỉ nào");
    await expect(page.locator("#mineOut [data-mine-batch-note]")).toContainText(".receipt.json");
  });
});

test.describe("Danh bạ đơn vị phát hành", () => {
  test("11 tab Đơn vị phát hành quét event từ DEPLOY_BLOCK, thấy đơn vị demo", async ({ page, net }) => {
    await open(page);
    await openDirectory(page);
    await expect(page.locator("#dirOut")).toContainText(SEPOLIA.issuerName);
    await expect(page.locator("#dirOut")).toContainText(SEPOLIA.issuer);
    expect(net.logCalls.length).toBeGreaterThan(0);
    expect(Math.min(...net.logCalls.map((c) => c.fromBlock))).toBe(SEPOLIA.deployBlock);
  });

  test('18 mọi RPC lỗi eth_getLogs → "Không tải được danh bạ" + số đơn vị từ activeIssuerCount()', async ({ page, net }) => {
    net.faults[TENDERLY] = { kind: "pruned" };
    net.faults[PUBLICNODE] = { kind: "pruned" };
    net.faults[DRPC] = { kind: "getLogsError" };
    await open(page, false);
    await openDirectory(page);
    await expect(page.locator("#dirOut")).toContainText("Không tải được danh bạ");
    await expect(page.locator("#dirOut")).toContainText("Contract ghi 1 đơn vị đang hoạt động");
    await expect(page.locator("#dirOut")).not.toContainText("Chưa có đơn vị nào");
    expect(net.logCalls.length).toBeGreaterThan(0);
    expect(net.logCalls.every((c) => !c.ok)).toBe(true);
  });

  test("19 Tenderly + publicnode xóa log, dRPC giới hạn 100 block → danh bạ vẫn đủ", async ({ page, net }) => {
    net.faults[TENDERLY] = { kind: "pruned" };
    net.faults[PUBLICNODE] = { kind: "pruned" };
    net.faults[DRPC] = { kind: "rangeLimit", maxBlocks: 100 };
    await open(page);
    await openDirectory(page);
    await expect(page.locator("#dirOut")).toContainText(SEPOLIA.issuerName);
    await expect(page.locator("#dirOut")).not.toContainText("Không tải được danh bạ");
    const ok = net.logCalls.filter((c) => c.ok);
    expect(ok.length).toBeGreaterThan(1);                                     // phải chia khúc
    expect(ok.every((c) => c.toBlock - c.fromBlock + 1 <= 100 && c.origin === DRPC)).toBe(true);
    expect(Math.min(...ok.map((c) => c.fromBlock))).toBe(SEPOLIA.deployBlock);   // không sót khúc đầu
  });
});

test.describe("An toàn trình duyệt", () => {
  test("12 0 vi phạm CSP qua luồng đọc đầy đủ", async ({ page, net }) => {
    await normalFlow(page);
    expect(await net.cspViolations()).toEqual([]);
  });

  test("13 0 lỗi console, 0 request ra Internet thật", async ({ page, net }) => {
    await normalFlow(page);
    expect(net.consoleErrors).toEqual([]);
    expect(net.blocked).toEqual([]);
  });

  test('14 RPC thứ hai chết → không kết luận "Hợp lệ"', async ({ page, net }) => {
    net.faults[PUBLICNODE] = { kind: "dead" };
    await open(page);   // danh bạ vẫn tải được qua Tenderly
    await verifySingle(page, DEMO_PDF);
    await expect(verdict(page)).toHaveText("Không kết luận được");
    await expect(page.locator("#verifyOut")).toContainText("CÁC RPC TRẢ KẾT QUẢ KHÁC NHAU");
    await expect(page.locator("#verifyOut .verdict.valid")).toHaveCount(0);
  });

  test("15 app.js bị sửa lén → trình duyệt chặn (SRI)", async ({ page, net }) => {
    net.appJsOverride = fs.readFileSync(path.join(ROOT, "app", "app.js"), "utf8") + "\n// sửa lén\n";
    await page.goto("/app/index.html");
    await expect.poll(() => net.consoleErrors.some((e) => /integrity/i.test(e))).toBe(true);
    await expect(page.locator("#anchorAddr")).toHaveText("—");
  });

  test("16 màn hình 390 px không cuộn ngang", async ({ page, net }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    for (const tab of ["verify", "issue", "mine", "manage", "directory", "admin"]) {
      await page.locator(`nav button[data-tab="${tab}"]`).click();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, "tab " + tab).toBeLessThanOrEqual(0);
    }
  });
});
