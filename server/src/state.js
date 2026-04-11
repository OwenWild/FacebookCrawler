import fs from "fs";
import { dataPath } from "./config.js";

export function loadSeen(cfg) {
  const p = dataPath(cfg, "seen-ids.json");
  if (!fs.existsSync(p)) return new Set();
  try {
    const arr = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map(String));
  } catch {
    return new Set();
  }
}

export function saveSeen(cfg, set) {
  const p = dataPath(cfg, "seen-ids.json");
  let arr = [...set];
  const max = cfg.maxSeenIds || 80000;
  if (arr.length > max) {
    arr = arr.slice(arr.length - max);
  }
  fs.writeFileSync(p, JSON.stringify(arr), "utf8");
}
