import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.join(__dirname, "..");

/**
 * Resolve config.json from env, cwd, or next to this package (works from repo root or server/).
 * Resolves storageStatePath and data/ relative to the config file directory.
 */
export function loadConfig() {
  const envPath = process.env.MARKETPLACE_CONFIG_PATH;
  const candidates = [];
  if (envPath) candidates.push(path.resolve(envPath));
  candidates.push(path.join(process.cwd(), "config.json"));
  candidates.push(path.join(process.cwd(), "server", "config.json"));
  candidates.push(path.join(serverRoot, "config.json"));
  candidates.push(path.join(serverRoot, "..", "config.json"));

  let configPath = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      configPath = c;
      break;
    }
  }
  if (!configPath) {
    throw new Error(
      `No config.json found. Tried:\n${candidates.map((x) => "  - " + x).join("\n")}\nCopy server/config.example.json to config.json (repo root or server/) or set MARKETPLACE_CONFIG_PATH.`
    );
  }

  const st = fs.statSync(configPath);
  if (st.isDirectory()) {
    throw new Error(
      `config path is a directory, not a file: ${configPath}\n` +
        `Remove the empty folder, then save your settings as a single file named config.json (Docker: host path must be a file, not a directory).`
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const cfg = JSON.parse(raw);
  if (!cfg.categories?.priority?.length) {
    throw new Error("config.json: categories.priority must be a non-empty array");
  }

  const configDir = path.dirname(path.resolve(configPath));
  cfg._configPath = configPath;
  cfg._configDir = configDir;

  const rel = cfg.storageStatePath || "./data/storage-state.json";
  cfg._storageStatePath = path.isAbsolute(rel)
    ? rel
    : path.resolve(configDir, rel);

  return cfg;
}

export function dataPath(cfg, name) {
  const base = cfg._configDir
    ? path.join(cfg._configDir, "data")
    : path.join(process.cwd(), "data");
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, name);
}
