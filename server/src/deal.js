/** Ported from extension/deal.js — keep in sync when tuning heuristics */

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
  if (/\b(new in box|nib|sealed|unopened|like new|mint)\b/i.test(t)) {
    score += 14;
    reasons.push("New / mint cues");
  }
  if (/\b(bundle|lot|everything included|extras)\b/i.test(t)) {
    score += 10;
    reasons.push("Bundle / extras");
  }

  const p = parseMoney(L.price);
  if (Number.isFinite(p) && p > 0) {
    const r = Math.round(p);
    if (r !== 123 && r !== 1234 && r % 5 !== 0 && r % 10 !== 0) {
      score += 6;
      reasons.push("Specific price");
    }
  }

  if (/\b(steal|rare|firm|obo)\b/i.test(t)) {
    score += 4;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    score >= 78 ? "Strong" : score >= 62 ? "Good" : score >= 48 ? "Okay" : "Weak";
  return { score, label, reasons };
}
