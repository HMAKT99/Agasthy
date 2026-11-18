import { defineConfig } from "@playwright/test";

// README screenshots and GIF from synthetic demo data (demo/demo-ipc.ts).
// Run with `pnpm screenshots` from the repository root.
export default defineConfig({
  testDir: "demo",
  timeout: 180_000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1360, height: 850 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
