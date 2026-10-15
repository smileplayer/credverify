// Bộ e2e Playwright — chạy: npm run test:e2e
// Node Hardhat (chainId 11155111) và trang tĩnh do global-setup.ts dựng; xem README trong test/e2e.
import { defineConfig, devices } from "@playwright/test";
import { WEB_URL } from "./env";

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: ".tmp/results",
  globalSetup: "./global-setup.ts",
  workers: 1,            // các ca dùng chung một chuỗi local
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { ...devices["Desktop Chrome"], baseURL: WEB_URL, trace: "retain-on-failure" },
  projects: [{ name: "chromium" }],
});
