import { loadConfig } from "./config.js";
import { runDigestOnce, runDigestLoop } from "./digest.js";

const cfg = loadConfig();
const once = process.argv.includes("--once");

const run = once ? runDigestOnce(cfg) : runDigestLoop(cfg);
run.catch((e) => {
  console.error(e);
  process.exit(1);
});
