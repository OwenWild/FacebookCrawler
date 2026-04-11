import fs from "fs";
import { dataPath } from "./config.js";

const UA =
  "MarketplaceShelfServer/1.0 (local; geocoding via https://nominatim.org/ policy)";

export function loadGeoCache(cfg) {
  const p = dataPath(cfg, "geo-cache.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) || {};
  } catch {
    return {};
  }
}

export function saveGeoCache(cfg, cache) {
  fs.writeFileSync(dataPath(cfg, "geo-cache.json"), JSON.stringify(cache), "utf8");
}

let lastAt = 0;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function geocodeAddress(q, cache) {
  const key = String(q || "")
    .trim()
    .toLowerCase();
  if (!key) return null;
  if (cache[key]) return cache[key];

  const wait = Math.max(0, 1100 - (Date.now() - lastAt));
  await new Promise((r) => setTimeout(r, wait));
  lastAt = Date.now();

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
    encodeURIComponent(q.trim());
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "en",
      "User-Agent": UA,
    },
  });
  if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
  const arr = await res.json();
  if (!arr?.[0]) return null;
  const o = { lat: parseFloat(arr[0].lat), lon: parseFloat(arr[0].lon) };
  cache[key] = o;
  return o;
}

export async function resolveRefTown(cfg, cache) {
  const town = (cfg.refTown || "").trim();
  if (!town) return null;
  return geocodeAddress(town, cache);
}
