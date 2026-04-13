import { setTimeout as sleep } from "timers/promises";
import { enrichListing } from "./listingMeta.js";

/**
 * Extract listing cards from a loaded Marketplace page (same idea as the Chrome extension).
 */
export async function scrapeVisibleListings(page) {
  const items = await page.evaluate(() => {
    const ITEM = /\/marketplace\/item\/(\d{8,22})/i;
    const PRICE =
      /(\$|€|£|CA\$|A\$)\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|CAD|AUD)\b|Free\b/i;

    function guessPrice(text) {
      if (!text) return null;
      const m = text.match(PRICE);
      return m ? m[0].trim() : null;
    }

    function looksLikePlaceLine(line) {
      if (!line || line.length < 3 || line.length > 120) return false;
      if (/^\$|€|£/.test(line)) return false;
      if (/,\s*[A-Z]{2}(\s|$|,)/.test(line)) return true;
      if (/,\s*[A-Za-z]/.test(line) && line.includes(",")) return true;
      return false;
    }

    function extractLocation(label, title, containerText, price) {
      if (label && label.includes(",")) {
        const parts = label.split(",").map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 3) {
          const tail = parts.slice(-2).join(", ");
          if (looksLikePlaceLine(tail) && tail !== (title || "").trim()) return tail.slice(0, 160);
        }
        if (parts.length >= 2) {
          const last = parts[parts.length - 1];
          if (looksLikePlaceLine(last) && last !== (title || "").trim()) return last.slice(0, 160);
        }
      }
      if (containerText) {
        const lines = containerText.split("\n").map((s) => s.trim()).filter(Boolean);
        const titleTrim = (title || "").trim();
        for (const line of lines) {
          if (!line || line === titleTrim) continue;
          if (price && line.includes(price)) continue;
          if (guessPrice(line) && line.length < 40) continue;
          if (looksLikePlaceLine(line)) return line.slice(0, 160);
        }
      }
      return null;
    }

    function extractTitleFromLabel(label, price) {
      if (!label) return null;
      let t = label.replace(/\s+/g, " ").trim();
      if (price && t.includes(price)) t = t.split(price)[0].trim();
      const parts = t.split(",").map((s) => s.trim());
      if (parts.length >= 2 && parts[0].length > 2) return parts[0];
      if (parts.length === 1) return parts[0].slice(0, 200) || null;
      return parts[0].slice(0, 200) || null;
    }

    const out = [];
    const seen = new Set();
    const nodes = document.querySelectorAll(
      'a[href*="marketplace/item"], a[href*="Marketplace/item"]'
    );

    nodes.forEach((a) => {
      const href = a.href || a.getAttribute("href") || "";
      const m = href.match(ITEM);
      if (!m) return;
      const id = m[1];
      if (seen.has(id)) return;
      seen.add(id);

      const label = a.getAttribute("aria-label") || "";
      const container =
        a.closest('[role="article"]') ||
        a.closest("div[data-pagelet]") ||
        a.parentElement?.parentElement?.parentElement;
      const ctext = container?.innerText || "";
      const blob = [label, ctext].join("\n").slice(0, 4000);
      const price = guessPrice(blob) || guessPrice(label);
      let title = extractTitleFromLabel(label, price);
      if (!title && container) {
        const lines = ctext.split("\n").map((s) => s.trim()).filter(Boolean);
        title =
          lines.find((l) => l.length > 3 && l.length < 200 && !PRICE.test(l)) || null;
      }
      if (!title) title = `Listing ${id}`;
      const loc = extractLocation(label, title, ctext, price);

      let canonical = href;
      try {
        const u = new URL(href, window.location.origin);
        u.search = "";
        canonical = u.toString();
      } catch {
        /* ignore */
      }

      out.push({
        id,
        url: canonical,
        title: title.slice(0, 300),
        price: price || null,
        location: loc,
        snippet: blob.slice(0, 2000),
        sourcePage: window.location.href.split("?")[0],
      });
    });

    return out;
  });
  return items.map(enrichListing);
}

export async function scrapeCategory(page, url, opts) {
  const scrollRounds = opts.scrollRounds ?? 8;
  const scrollPauseMs = opts.scrollPauseMs ?? 1300;
  const timeout = opts.pageGotoTimeoutMs ?? 120000;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await sleep(2500);

  for (let i = 0; i < scrollRounds; i++) {
    await page.evaluate(() => {
      window.scrollBy(0, Math.floor(window.innerHeight * 0.92));
    });
    await sleep(scrollPauseMs);
  }

  return scrapeVisibleListings(page);
}
