import { loadConfig } from "./config.js";
import { runDigestLoop } from "./digest.js";
import { startInteractionServer } from "./discordInteractions.js";

const cfg = loadConfig();

if (process.env.DISCORD_PUBLIC_KEY?.trim()) {
  startInteractionServer(cfg);
}

runDigestLoop(cfg).catch((e) => {
  console.error(e);
  process.exit(1);
});
