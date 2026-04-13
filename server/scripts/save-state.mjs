/**
 * Save Facebook session for Playwright (copy the file to your Linux server).
 *
 * Run from repo root:  npx --prefix server playwright install chromium   (once)
 *                       node server/scripts/save-state.mjs
 * Or from server/:      npm run save-session
 *
 * Log in in the browser window, then press Enter here. Writes to the path in config.json
 * (storageStatePath relative to the config file folder — usually data/storage-state.json).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");

async function loadOutPath() {
  try {
    const configUrl = pathToFileURL(path.join(serverRoot, "src", "config.js")).href;
    const { loadConfig } = await import(configUrl);
    const cfg = loadConfig();
    return cfg._storageStatePath;
  } catch (e) {
    const fallback = path.join(serverRoot, "data", "storage-state.json");
    console.warn(
      "[save-session] Could not load config, using default:\n",
      fallback,
      "\n",
      e.message
    );
    return fallback;
  }
}

function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const out = await loadOutPath();
fs.mkdirSync(path.dirname(out), { recursive: true });

console.log("Session file will be saved to:\n  " + path.resolve(out) + "\n");

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  locale: "en-US",
});
const page = await context.newPage();

await page.goto("https://www.facebook.com/marketplace/", {
  waitUntil: "domcontentloaded",
  timeout: 120000,
});

await question(
  "Log into Facebook in the browser (2FA if needed). When you see Marketplace, press Enter here to save session…\n"
);

await context.storageState({ path: out });
await browser.close();

console.log("\nSaved OK:\n  " + path.resolve(out));
console.log(
  "\nCopy this file to your server in the same place relative to config.json, e.g.:\n" +
    "  scp \"" +
    path.resolve(out).replace(/\\/g, "/") +
    '" user@server:/path/to/FacebookCrawler/data/storage-state.json'
);
