import fs from "fs";
import path from "path";

export function loadConfig() {
  const envPath = process.env.MARKETPLACE_CONFIG_PATH;
  const defaultPath = path.join(process.cwd(), "config.json");
  const configPath = envPath || defaultPath;
  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Missing ${configPath}. Copy server/config.example.json to config.json and edit.`
    );
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.categories?.priority?.length) {
    throw new Error("config.json: categories.priority must be a non-empty array");
  }
  cfg._configPath = configPath;
  return cfg;
}

export function dataPath(cfg, name) {
  const base = path.join(process.cwd(), "data");
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, name);
}
