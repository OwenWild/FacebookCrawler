/**
 * Derive listing age text and cash-only / no-trades signals from scraped title + snippet.
 * Marketplace tiles vary; missing data stays null / false.
 */

const MAX_SNIP = 4000;

/**
 * @param {string} text
 * @returns {boolean} true if seller indicates cash only or no trades (per user: single yes/no)
 */
export function detectCashOnly(text) {
  if (!text) return false;
  const t = String(text).toLowerCase();
  if (/\b(cash\s*only|cash\s+sales?\s*only|cash\s*&\s*cash\s*only)\b/.test(t)) {
    return true;
  }
  if (/\bno\s+trades?\b/.test(t) && !/\btrades?\s+(accepted|ok|welcome)\b/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Best-effort "how long listed" string from visible card text (Facebook wording changes often).
 * @param {string} text
 * @returns {string | null}
 */
export function detectListedFor(text) {
  if (!text) return null;
  const flat = String(text).replace(/\s+/g, " ").trim();

  let m = flat.match(/\bListed\s+([^·|]+?)(?=\s*[·|]|\s{2,}|$)/i);
  if (m) {
    const s = m[1].trim().replace(/\s+/g, " ");
    if (s.length > 3 && s.length < 120) return s;
  }

  m = flat.match(
    /\b(\d+)\s*(seconds?|minutes?|mins?|hours?|hrs?|days?|weeks?|wks?|months?|mos?|years?)\s+ago\b/i
  );
  if (m) return `${m[1]} ${m[2]} ago`;

  m = flat.match(/\b(about|over|almost|nearly)\s+a\s+(day|week|month|year)\s+ago\b/i);
  if (m) return `${m[0]}`;

  if (/\bjust\s+now\b/i.test(flat)) return "Just now";
  if (/\byesterday\b/i.test(flat)) return "Yesterday";

  m = flat.match(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?\b/i
  );
  if (m) return `Listed ${m[0]}`;

  return null;
}

/**
 * Rough age in hours for scoring (null if not parseable).
 * @param {string | null} listedFor
 * @param {string} fullText
 * @returns {number | null}
 */
export function listedAgeHoursEstimate(listedFor, fullText) {
  const src = `${listedFor || ""} ${fullText || ""}`.toLowerCase();
  if (/\bjust\s+now\b/.test(src)) return 0.05;
  if (/\byesterday\b/.test(src)) return 30;

  let m = src.match(
    /\b(\d+)\s*(second|minute|min|hour|hr|day|week|wk|month|mo|year)s?\s+ago\b/
  );
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    if (u.startsWith("second")) return n / 3600;
    if (u.startsWith("minute") || u === "min") return n / 60;
    if (u.startsWith("hour") || u === "hr") return n;
    if (u.startsWith("day")) return n * 24;
    if (u.startsWith("week") || u === "wk") return n * 24 * 7;
    if (u.startsWith("month") || u === "mo") return n * 24 * 30;
    if (u.startsWith("year")) return n * 24 * 365;
  }

  m = src.match(/\b(a|an)\s+(day|week|month|year)\s+ago\b/);
  if (m) {
    const u = m[2];
    if (u === "day") return 24;
    if (u === "week") return 24 * 7;
    if (u === "month") return 24 * 30;
    if (u === "year") return 24 * 365;
  }

  return null;
}

/**
 * @param {object} listing
 * @returns {object} listing with listedFor, cashOnly, listedAgeHours
 */
export function enrichListing(listing) {
  const text = `${listing.title || ""}\n${listing.snippet || ""}`.slice(0, MAX_SNIP);
  const listedFor = detectListedFor(text);
  const cashOnly = detectCashOnly(text);
  const listedAgeHours = listedAgeHoursEstimate(listedFor, text);
  return {
    ...listing,
    listedFor,
    cashOnly,
    listedAgeHours,
  };
}
