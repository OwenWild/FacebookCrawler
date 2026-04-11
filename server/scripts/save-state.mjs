/**
 * Run on a machine with a display (or X11 forward). Log into Facebook in the opened window,
 * then press Enter in the terminal to save Playwright storage to ./data/storage-state.json
 *
 * Usage: node scripts/save-state.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const out = path.join(process.cwd(), "data", "storage-state.json");
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  locale: "en-US",
});
const page = await context.newPage();
await page.goto("https://www.facebook.com/marketplace/", { timeout: 120000 });

process.stdout.write(
  "Log in and complete any checks in the browser window, then press Enter here to save session…\n"
);
await new Promise((r) => process.stdin.once("data", r));

await context.storageState({ path: out });
await browser.close();
process.stdout.write(`Saved ${out}\n`);
