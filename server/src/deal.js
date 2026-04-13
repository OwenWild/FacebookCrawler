/** Ported from extension/deal.js — keep in sync when tuning heuristics */

/**
 * @typedef {object} DealResult
 * @property {number} score
 * @property {string} label
 * @property {string[]} reasons
 */

export function parseMoney(s) {
  if (!s || /^free$/i.test(String(s).trim())) return NaN;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function isPlaceholderMakeOffer(L) {
  const t = `${L.title || ""} ${L.snippet || ""}`.toLowerCase();
  const hasOffer =
    /\b(make\s+an?\s+offer|make offer|or best offer|\bobo\b|best offer)\b/i.test(t);
  if (!hasOffer) return false;
  const p = parseMoney(L.price);
  if (!Number.isFinite(p)) return false;
  const r = Math.round(p);
  return r === 123 || r === 1234;
}

/**
 * @param {object} L listing (optionally enriched: cashOnly, listedAgeHours, listedFor)
 * @returns {DealResult}
 */
export function scoreDeal(L) {
  if (isPlaceholderMakeOffer(L)) {
    return {
      score: 0,
      label: "Noise",
      reasons: ["Placeholder price + offer language"],
    };
  }

  let score = 52;
  const reasons = [];
  const t = `${L.title || ""} ${L.snippet || ""}`.toLowerCase();

  if (/\b(for parts|not working|broken|as-?is|damaged|cracked|sold)\b/i.test(t)) {
    score -= 22;
    reasons.push("Risky condition / sold");
  }
  if (/\b(project|parts\s*only|untested|unknown\s+if\s+works|needs\s+repair)\b/i.test(t)) {
    score -= 10;
    reasons.push("Project / untested cues");
  }
  if (/\b(new in box|nib|sealed|unopened|like new|mint)\b/i.test(t)) {
    score += 14;
    reasons.push("New / mint cues");
  }
  if (/\b(bundle|lot|everything included|extras)\b/i.test(t)) {
    score += 10;
    reasons.push("Bundle / extras");
  }
  if (/\b(warranty|still\s+under\s+warranty|receipt)\b/i.test(t)) {
    score += 5;
    reasons.push("Warranty / receipt");
  }
  if (/\b(must\s+sell|need\s+gone|moving\s+sale|relocat|price\s+drop|reduced|lowered)\b/i.test(t)) {
    score += 8;
    reasons.push("Motivated / price-cut cues");
  }
  if (/\b(negotiable|obo\s+welcome|reasonable\s+offers?|open\s+to\s+offers?)\b/i.test(t)) {
    score += 4;
    reasons.push("Negotiable");
  }
  if (/\b(pickup\s+only|local\s+pickup|porch\s+pickup|cash\s+at\s+pickup)\b/i.test(t)) {
    score += 3;
    reasons.push("Local pickup");
  }
  if (/\b(lowball|no\s+lowballs?|serious\s+buyers?\s+only|time\s+wasters)\b/i.test(t)) {
    score -= 3;
    reasons.push("Strict / lowball language");
  }

  const p = parseMoney(L.price);
  if (Number.isFinite(p) && p > 0) {
    const r = Math.round(p);
    if (r !== 123 && r !== 1234 && r % 5 !== 0 && r % 10 !== 0) {
      score += 6;
      reasons.push("Specific price");
    }
    if (r > 0 && r % 2 === 1 && r > 20 && r < 5000) {
      score += 2;
      reasons.push("Odd-dollar price");
    }
  }

  if (/\b(steal|rare)\b/i.test(t)) {
    score += 4;
  }
  if (/\bfirm\b/i.test(t) && !/\bnegotiable\b/i.test(t)) {
    score += 2;
    reasons.push("Firm price");
  }
  if (/\bobo\b|\bor\s+best\s+offer\b/i.test(t)) {
    score += 3;
    reasons.push("OBO");
  }

  if (L.cashOnly === true) {
    score += 3;
    reasons.push("Cash only / no trades");
  }

  const hours =
    typeof L.listedAgeHours === "number" && Number.isFinite(L.listedAgeHours)
      ? L.listedAgeHours
      : null;
  if (hours != null) {
    if (hours <= 6) {
      score += 6;
      reasons.push("Very fresh (<6h)");
    } else if (hours <= 48) {
      score += 4;
      reasons.push("Fresh (1–2d)");
    } else if (hours <= 24 * 7) {
      score += 1;
      reasons.push("Recent week");
    } else if (hours >= 24 * 30) {
      score += 5;
      reasons.push("Older listing (possible deal)");
    } else if (hours >= 24 * 14) {
      score += 2;
      reasons.push("Two+ weeks up");
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    score >= 78 ? "Strong" : score >= 62 ? "Good" : score >= 48 ? "Okay" : "Weak";
  return { score, label, reasons };
}
