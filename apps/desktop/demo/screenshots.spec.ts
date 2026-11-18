/**
 * Generates the README screenshots and tour GIF from synthetic demo data.
 *
 *   pnpm screenshots        (from the repository root)
 *
 * Output: docs/screenshots/*.png (framed like a macOS window), plus unframed
 * captures in apps/demo-video/public/shots for the demo video (pnpm demo:video).
 *
 *   SHOTS=graph,usage pnpm screenshots   (only these; the rest are left as they are)
 */
import { type Page, expect, test } from "@playwright/test";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installDemoIpc } from "./demo-ipc";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../../../docs/screenshots");
const raw = join(here, "out");

test.describe.configure({ mode: "serial" });

const only = process.env.SHOTS ? new Set(process.env.SHOTS.split(",").map((x) => x.trim())) : null;
const wanted = (name: string) => !only || only.has(name);

async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  // Hide carets and pause animations so frames are stable.
  await page.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important;animation-duration:0s!important;transition-duration:0s!important}" });
  await page.waitForTimeout(400);
}

async function shot(page: Page, name: string) {
  if (!wanted(name)) return;
  await settle(page);
  await page.screenshot({ path: join(raw, `${name}.png`) });
}

/** Place a raw screenshot in a macOS-style window on a soft backdrop. */
async function frame(page: Page, name: string, dark = false) {
  const data = readFileSync(join(raw, `${name}.png`)).toString("base64");
  const bg = dark
    ? "radial-gradient(1200px 700px at 20% 0%, #3a2d24 0%, transparent 60%), radial-gradient(900px 600px at 100% 100%, #1d2a3a 0%, transparent 55%), #121212"
    : "radial-gradient(1200px 700px at 15% 0%, #f6e3d3 0%, transparent 60%), radial-gradient(900px 600px at 100% 100%, #dfe7f3 0%, transparent 55%), #f4f1ed";
  await page.setViewportSize({ width: 1360 + 160, height: 850 + 140 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:1520px;height:990px">
    <div id="win" style="position:relative;width:1360px;height:850px;border-radius:12px;overflow:hidden;
      box-shadow:0 0 0 0.5px rgba(0,0,0,${dark ? 0.6 : 0.18}),0 30px 80px rgba(0,0,0,${dark ? 0.55 : 0.22}),0 8px 24px rgba(0,0,0,${dark ? 0.35 : 0.1})">
      <img src="data:image/png;base64,${data}" style="display:block;width:1360px;height:850px"/>
      <div style="position:absolute;top:17px;left:18px;display:flex;gap:8px">
        <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.15)"></span>
        <span style="width:12px;height:12px;border-radius:50%;background:#febc2e;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.15)"></span>
        <span style="width:12px;height:12px;border-radius:50%;background:#28c840;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.15)"></span>
      </div>
    </div></body></html>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(out, `${name}.png`) });
}

test.beforeAll(() => {
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  mkdirSync(out, { recursive: true });
});

test("capture pages", async ({ page }) => {
  await installDemoIpc(page);

  await page.goto("/#/");
  await expect(page.getByRole("list", { name: "Insights" })).toBeVisible();
  await shot(page, "overview");

  await page.goto("/#/agents");
  const card = page.getByRole("article", { name: "Claude Code session" }).first();
  await expect(card).toBeVisible();
  await shot(page, "agents");
  await card.getByRole("button", { name: /processes started/ }).click();
  await shot(page, "agents-expanded");

  await page.goto("/#/usage");
  await expect(page.getByRole("img", { name: /Daily token usage/ })).toBeVisible();
  // Show a day's tooltip, as a reader hovering would.
  await page.getByRole("img", { name: /Daily token usage/ }).getByRole("button").nth(23).hover();
  await shot(page, "usage");

  await page.goto("/#/operator");
  await page.getByRole("button", { name: "Clean up after my agents" }).click();
  await expect(page.getByText("still running after their agent exited")).toBeVisible();
  await shot(page, "operator");
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("dialog", { name: "Review action" })).toBeVisible();
  await shot(page, "review");

  await page.goto("/#/graph");
  await expect(page.getByRole("button", { name: "Claude Code", exact: true })).toBeVisible();
  await shot(page, "graph");

  await page.goto("/#/storage");
  await page.waitForTimeout(600);
  await shot(page, "storage");
});

test("capture remaining sections", async ({ page }) => {
  await installDemoIpc(page);
  const pages: [string, string][] = [
    ["discovery", "/#/discovery?tab=repositories&id=" + encodeURIComponent("repository:/Users/dev/code/acme-web")],
    ["discovery-tools", "/#/discovery?tab=tools"],
    ["ai-ecosystem", "/#/ai"],
    ["ai-instructions", "/#/ai?tab=instructions"],
    ["processes", "/#/processes"],
    ["security", "/#/security"],
    ["impact", "/#/impact?id=" + encodeURIComponent("package:homebrew:openssl@3")],
    ["snapshots", "/#/snapshots"],
  ];
  for (const [name, url] of pages) {
    await page.goto(url);
    await page.waitForTimeout(900);
    await shot(page, name);
  }
});

test("capture dark hero", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 1360, height: 850 }, deviceScaleFactor: 2, baseURL: "http://127.0.0.1:1420" });
  const page = await ctx.newPage();
  await installDemoIpc(page);
  await page.goto("/#/agents");
  await expect(page.getByRole("article", { name: "Claude Code session" }).first()).toBeVisible();
  await shot(page, "agents-dark");
  await ctx.close();
});

test("frame screenshots and keep raw captures for the video", async ({ browser }) => {
  const page = await (await browser.newContext({ deviceScaleFactor: 2 })).newPage();
  for (const n of ["overview", "agents", "agents-expanded", "usage", "operator", "review", "graph", "storage", "discovery", "discovery-tools", "ai-ecosystem", "ai-instructions", "processes", "security", "impact", "snapshots"].filter(wanted)) await frame(page, n);
  if (wanted("agents-dark")) await frame(page, "agents-dark", true);

  // Unframed captures for the demo video (apps/demo-video/public/shots).
  const shots = join(here, "../../demo-video/public/shots");
  if (!only) rmSync(shots, { recursive: true, force: true });
  mkdirSync(shots, { recursive: true });
  for (const f of readdirSync(raw).filter((x) => x.endsWith(".png"))) copyFileSync(join(raw, f), join(shots, f));
  rmSync(raw, { recursive: true, force: true });
});
