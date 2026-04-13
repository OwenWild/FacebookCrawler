import { setTimeout as sleep } from "timers/promises";
import { loadConfig } from "./config.js";
import {
  sweepMarketplace,
  passesDistance,
  distanceMilesFromRef,
} from "./runner.js";
import { scoreDeal, isPlaceholderMakeOffer } from "./deal.js";
import { loadSeen, saveSeen } from "./state.js";
import { saveGeoCache } from "./geocode.js";
import { postDiscordDigest } from "./discord.js";

/**
 * One sweep: scrape → pick listings that are new since last run, in radius (if configured),
 * sort by deal score (then distance), post a single Discord digest.
 */
export async function runDigestOnce(cfg) {
  const seen = loadSeen(cfg);
  const seedMode = seen.size === 0;

  const { unique, geoCache, refPt } = await sweepMarketplace(cfg);

  const maxMi = cfg.maxDistanceMiles;
  const needRadius = maxMi != null && Number.isFinite(maxMi);

  if (needRadius && (!(cfg.refTown || "").trim() || !refPt)) {
    console.warn(
      "[digest] refTown is missing or could not be geocoded — set refTown in config for radius filtering."
    );
  }

  const newListings = unique.filter((l) => !seen.has(l.id));

  if (needRadius && !refPt) {
    saveGeoCache(cfg, geoCache);
    console.error(
      "[digest] Stopping: maxDistanceMiles is set but refTown could not be geocoded. Fix refTown or clear maxDistanceMiles. (seen-ids not updated.)"
    );
    return;
  }

  const hidePh = cfg.hidePlaceholderMakeOffer !== false;
  const minDigest = cfg.digestMinDealScore ?? 0;

  const lines = [];
  for (const listing of newListings) {
    if (hidePh && isPlaceholderMakeOffer(listing)) continue;

    const deal = scoreDeal(listing);
    if (deal.score < minDigest) continue;

    if (needRadius) {
      if (!listing.location?.trim()) continue;
      if (!(await passesDistance(cfg, listing, refPt, geoCache))) continue;
    }

    const distanceMi = await distanceMilesFromRef(listing, refPt, geoCache);
    lines.push({ listing, deal, distanceMi });
  }

  lines.sort((a, b) => {
    if (b.deal.score !== a.deal.score) return b.deal.score - a.deal.score;
    const da = a.distanceMi ?? 1e9;
    const db = b.distanceMi ?? 1e9;
    return da - db;
  });

  const hook = (cfg.discordWebhookUrl || "").trim();
  if (!hook) {
    console.warn("[digest] discordWebhookUrl is empty — nothing posted.");
    console.log(JSON.stringify(lines.slice(0, 20), null, 2));
  } else {
    const title = seedMode
      ? `Initial snapshot (first run) · ${new Date().toISOString()}`
      : `New listings · ${new Date().toISOString()}`;
    await postDiscordDigest(
      hook,
      {
        title,
        lines,
      },
      { postWhenEmpty: !!cfg.digestPostWhenEmpty }
    );
    console.log(
      `[digest] Posted ${lines.length} listing(s) to Discord${seedMode ? " (first run)" : ""}.`
    );
  }

  for (const l of newListings) {
    seen.add(l.id);
  }
  saveGeoCache(cfg, geoCache);
  saveSeen(cfg, seen);

  console.log(`[digest] Marked ${newListings.length} new ID(s) seen; total seen ${seen.size}`);
}

export async function runDigestLoop(cfg) {
  const intervalMin = cfg.digestIntervalMinutes ?? cfg.cycleIntervalMinutes ?? 30;
  while (true) {
    const t0 = Date.now();
    try {
      await runDigestOnce(cfg);
    } catch (e) {
      console.error("[digest] error", e);
    }
    const elapsed = Date.now() - t0;
    const wait = Math.max(0, intervalMin * 60 * 1000 - elapsed);
    console.log(`[digest] next run in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}
