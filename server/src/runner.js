import { chromium } from "playwright";
import fs from "fs";
import { setTimeout as sleep } from "timers/promises";
import { scrapeCategory } from "./scrape.js";
import { scoreDeal, isPlaceholderMakeOffer } from "./deal.js";
import { loadSeen, saveSeen } from "./state.js";
import { notifyListing } from "./notify.js";
import {
  loadGeoCache,
  saveGeoCache,
  geocodeAddress,
  resolveRefTown,
  haversineKm,
} from "./geocode.js";

export function milesFromKm(km) {
  return km * 0.621371;
}

export async function passesDistance(cfg, listing, refPt, geoCache) {
  const maxMi = cfg.maxDistanceMiles;
  if (maxMi == null || !Number.isFinite(maxMi)) return true;
  if (!refPt || !listing.location?.trim()) return true;
  const pt = await geocodeAddress(listing.location.trim(), geoCache);
  if (!pt) return true;
  const km = haversineKm(refPt.lat, refPt.lon, pt.lat, pt.lon);
  return milesFromKm(km) <= maxMi;
}

/** @returns {Promise<number | null>} miles from ref, or null if unknown */
export async function distanceMilesFromRef(listing, refPt, geoCache) {
  if (!refPt || !listing.location?.trim()) return null;
  const pt = await geocodeAddress(listing.location.trim(), geoCache);
  if (!pt) return null;
  return milesFromKm(haversineKm(refPt.lat, refPt.lon, pt.lat, pt.lon));
}

async function processNewListings(cfg, batch, seen, seedMode, refPt, geoCache) {
  const minScore = cfg.dealScoreMin ?? 65;
  const hidePh = cfg.hidePlaceholderMakeOffer !== false;

  for (const listing of batch) {
    if (seen.has(listing.id)) continue;
    seen.add(listing.id);

    if (seedMode) continue;

    if (hidePh && isPlaceholderMakeOffer(listing)) continue;

    const deal = scoreDeal(listing);
    if (deal.score < minScore) continue;

    if (!(await passesDistance(cfg, listing, refPt, geoCache))) continue;

    await notifyListing(cfg, listing, deal, { category: listing._categoryName });
  }
}

async function runCategory(context, cfg, entry) {
  const page = await context.newPage();
  try {
    const url = entry.url;
    const items = await scrapeCategory(page, url, {
      scrollRounds: cfg.scrollRounds ?? 8,
      scrollPauseMs: cfg.scrollPauseMs ?? 1300,
      pageGotoTimeoutMs: cfg.pageGotoTimeoutMs ?? 120000,
    });
    for (const it of items) it._categoryName = entry.name;
    return items;
  } finally {
    await page.close();
  }
}

async function runCategoryList(context, cfg, list, deadlineMs) {
  const out = [];
  const perMax = cfg.perCategoryMaxMs ?? 180000;
  for (const entry of list) {
    if (Date.now() >= deadlineMs) break;
    const catDeadline = Date.now() + perMax;
    console.log(`[sweep] ${entry.name} → ${entry.url}`);
    const batch = await runCategory(context, cfg, entry);
    out.push(...batch);
    if (Date.now() >= catDeadline) {
      console.warn(`[sweep] ${entry.name} hit perCategoryMaxMs`);
    }
  }
  return out;
}

/**
 * Scrape all configured categories and return de-duplicated listings (does not update seen state).
 */
export async function sweepMarketplace(cfg) {
  const statePath = cfg._storageStatePath || cfg.storageStatePath;
  if (!statePath || !fs.existsSync(statePath)) {
    throw new Error(
      `Missing storage state at ${statePath}.\n` +
        `On this PC run: cd server && npm run save-session\n` +
        `Then copy that file to the same path on your server (next to config.json under data/).`
    );
  }

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

  const geoCache = loadGeoCache(cfg);
  const refPt = await resolveRefTown(cfg, geoCache);

  const cycleStart = Date.now();
  const priorityDeadline = cycleStart + (cfg.priorityTimeBudgetMs ?? 15 * 60 * 1000);
  const cycleDeadline =
    cycleStart + (cfg.maxCycleDurationMs ?? 45 * 60 * 1000);

  const priority = cfg.categories.priority || [];
  const remainder = cfg.categories.remainder || [];

  let all = [];
  try {
    all = all.concat(
      await runCategoryList(context, cfg, priority, priorityDeadline)
    );
    if (Date.now() < cycleDeadline && remainder.length) {
      all = all.concat(
        await runCategoryList(context, cfg, remainder, cycleDeadline)
      );
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const byId = new Map();
  for (const it of all) {
    if (!byId.has(it.id)) byId.set(it.id, it);
  }
  const unique = [...byId.values()];

  return { unique, geoCache, refPt };
}

export async function runOneCycle(cfg) {
  const seen = loadSeen(cfg);
  const seedMode = seen.size === 0;

  const { unique, geoCache, refPt } = await sweepMarketplace(cfg);

  if (seedMode) {
    console.log(
      `[cycle] Seed mode: marking ${unique.length} listings seen (no notifications).`
    );
  }

  await processNewListings(cfg, unique, seen, seedMode, refPt, geoCache);
  saveGeoCache(cfg, geoCache);
  saveSeen(cfg, seen);

  console.log(
    `[cycle] done — seen total ${seen.size}, seedMode=${seedMode}, listings this sweep ${unique.length}`
  );
}

export async function runLoop(cfg) {
  const intervalMin = cfg.cycleIntervalMinutes ?? 30;
  while (true) {
    const t0 = Date.now();
    try {
      await runOneCycle(cfg);
    } catch (e) {
      console.error("[cycle] error", e);
    }
    const elapsed = Date.now() - t0;
    const wait = Math.max(0, intervalMin * 60 * 1000 - elapsed);
    console.log(`[sleep] ${Math.round(wait / 1000)}s until next cycle`);
    await sleep(wait);
  }
}
