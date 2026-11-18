import { defineConfig } from "@playwright/test";

// UI end-to-end tests run the real frontend in a browser against a test-only
// IPC fixture (e2e/fixtures). Tauri's WebDriver does not support macOS's
// WKWebView, so the packaged app's backend is covered by Rust tests instead.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    // Playwright's own Chromium, locally as in CI. An installed Google Chrome
    // can be far slower under automation (one release took minutes for the
    // suite instead of seconds) and made timing-sensitive checks fail.
    // One-time setup: `pnpm e2e:setup`.
    viewport: { width: 1320, height: 860 },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
