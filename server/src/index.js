import { loadConfig } from "./config.js";
import { runLoop, runOneCycle } from "./runner.js";

const cfg = loadConfig();
const once = process.argv.includes("--once");

const run = once ? runOneCycle(cfg) : runLoop(cfg);
run.catch((e) => {
  console.error(e);
  process.exit(1);
});
