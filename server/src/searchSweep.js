import { chromium } from "playwright";
import fs from "fs";
import { scrapeCategory } from "./scrape.js";
import { scoreDeal } from "./deal.js";
import {
  passesDistance,
  distanceMilesFromRef,
} from "./runner.js";
import {
  loadGeoCache,
  saveGeoCache,
  geocodeAddress,
} from "./geocode.js";

let searchBusy = false;

export function isSearchBusy() {
  return searchBusy;
}

/**
 * One-off Marketplace search → listings within radius of refTown (miles).
 */
export async function runKeywordRadiusSearch(cfg, opts) {
  const query = String(opts.query || "").trim();
  const refTown = String(opts.refTown || "").trim();
  const miles = Number(opts.miles);
  if (!query) throw new Error("query is required");
  if (!refTown) throw new Error("location is required");
  if (!Number.isFinite(miles) || miles <= 0) throw new Error("miles must be a positive number");

  if (searchBusy) {
    throw new Error("Another search is already running (wait for it to finish).");
  }
  searchBusy = true;

  try {
  const statePath = cfg._storageStatePath || cfg.storageStatePath;
  if (!statePath || !fs.existsSync(statePath)) {
    throw new Error(
      "Missing storage state. Run npm run save-session on a desktop and copy data/storage-state.json."
    );
  }

  const geoCache = loadGeoCache(cfg);
  const refPt = await geocodeAddress(refTown, geoCache);
  if (!refPt) {
    throw new Error(`Could not geocode location: ${refTown}`);
  }

  const url = `https://www.facebook.com/marketplace/search?query=${encodeURIComponent(query)}`;

  const cfgRadius = { ...cfg, maxDistanceMiles: miles };

  const browser = await chromium.launch({
    headless: cfg.headless !== false,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    storageState: statePath,
    userAgent:
      cfg.userAgent ||
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1365, height: 900 },
    locale: "en-US",
  });

  let items = [];
  try {
    const page = await context.newPage();
    try {
      items = await scrapeCategory(page, url, {
        scrollRounds: cfg.scrollRounds ?? 10,
        scrollPauseMs: cfg.scrollPauseMs ?? 1400,
        pageGotoTimeoutMs: cfg.pageGotoTimeoutMs ?? 120000,
      });
    } finally {
      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const lines = [];
  for (const listing of items) {
    if (!listing.location?.trim()) continue;
    if (!(await passesDistance(cfgRadius, listing, refPt, geoCache))) continue;
    const deal = scoreDeal(listing);
    const distanceMi = await distanceMilesFromRef(listing, refPt, geoCache);
    lines.push({ listing, deal, distanceMi });
  }

  lines.sort((a, b) => {
    if (b.deal.score !== a.deal.score) return b.deal.score - a.deal.score;
    const da = a.distanceMi ?? 1e9;
    const db = b.distanceMi ?? 1e9;
    return da - db;
  });

  saveGeoCache(cfg, geoCache);

  return {
    lines,
    query,
    refTown,
    miles,
    searchUrl: url,
    refPt,
  };
  } finally {
    searchBusy = false;
  }
}
