/** @typedef {{ id: string, url: string, title: string, price: string | null, thumb: string | null, capturedAt: string, sourcePage?: string, location?: string | null, snippet?: string, dealMeta?: { score: number, label: string, reasons?: string[], at?: string } }} Listing */

let allListings = [];
let geoCache = {};
/** @type {Map<string, number>} listing id -> distance km from ref */
const distKmCache = new Map();
let shelfUi = {
  refTown: "",
  refLat: null,
  refLon: null,
  distanceUnit: "mi",
  hidePlaceholderOffers: true,
  pinGreat: true,
};
let geoSaveTimer = null;
let distanceBusy = false;

function parseMoney(s) {
  if (!s || /^free$/i.test(s.trim())) return 0;
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function dealInfo(L) {
  if (L.dealMeta && typeof L.dealMeta.score === "number") return L.dealMeta;
  return ShelfDeal.scoreDeal(L);
}

function formatDist(km) {
  if (km == null || Number.isNaN(km)) return "—";
  if (shelfUi.distanceUnit === "km") return `${km.toFixed(1)} km`;
  const mi = km * 0.621371;
  return `${mi.toFixed(1)} mi`;
}

function formatDistCell(L) {
  if (shelfUi.refLat == null || shelfUi.refLon == null) return "—";
  if (!L.location || !String(L.location).trim()) return "—";
  const km = distKmCache.get(L.id);
  if (km == null) return "…";
  return formatDist(km);
}

function scheduleGeoSave() {
  clearTimeout(geoSaveTimer);
  geoSaveTimer = setTimeout(() => {
    chrome.storage.local.set({ geoCache });
  }, 500);
}

function getFiltered() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const minRaw = document.getElementById("minP").value.trim();
  const maxRaw = document.getElementById("maxP").value.trim();
  const minN = minRaw === "" ? NaN : parseFloat(minRaw);
  const maxN = maxRaw === "" ? NaN : parseFloat(maxRaw);
  const hidePh = document.getElementById("hidePlaceholder").checked;

  return allListings.filter((L) => {
    if (hidePh && ShelfDeal.isPlaceholderMakeOffer(L)) return false;
    const hay = [L.title, L.price || "", L.url, L.sourcePage || "", L.location || ""]
      .join(" ")
      .toLowerCase();
    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      if (words.length && !words.every((w) => hay.includes(w))) return false;
    }
    const p = L.price ? parseMoney(L.price) : NaN;
    if (!Number.isNaN(minN) && (Number.isNaN(p) || p < minN)) return false;
    if (!Number.isNaN(maxN) && (Number.isNaN(p) || p > maxN)) return false;
    return true;
  });
}

function sortListings(list, key) {
  const pinGreat = document.getElementById("pinGreat").checked;
  const out = [...list];
  switch (key) {
    case "deal-desc":
      out.sort((a, b) => {
        const sa = dealInfo(a).score;
        const sb = dealInfo(b).score;
        if (sb !== sa) return sb - sa;
        if (pinGreat) {
          const da = distKmCache.get(a.id);
          const db = distKmCache.get(b.id);
          if (da != null && db != null) return da - db;
        }
        return new Date(b.capturedAt) - new Date(a.capturedAt);
      });
      break;
    case "dist-asc":
      out.sort((a, b) => {
        const da = distKmCache.get(a.id);
        const db = distKmCache.get(b.id);
        if (da == null && db == null) return new Date(b.capturedAt) - new Date(a.capturedAt);
        if (da == null) return 1;
        if (db == null) return -1;
        if (da !== db) return da - db;
        return dealInfo(b).score - dealInfo(a).score;
      });
      break;
    case "date-asc":
      out.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
      break;
    case "date-desc":
      out.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
      break;
    case "title-asc":
      out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      break;
    case "title-desc":
      out.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
      break;
    case "price-asc":
      out.sort((a, b) => {
        const pa = parseMoney(a.price);
        const pb = parseMoney(b.price);
        return (Number.isNaN(pa) ? 1e12 : pa) - (Number.isNaN(pb) ? 1e12 : pb);
      });
      break;
    case "price-desc":
      out.sort((a, b) => {
        const pa = parseMoney(a.price);
        const pb = parseMoney(b.price);
        return (Number.isNaN(pb) ? -1e12 : pb) - (Number.isNaN(pa) ? -1e12 : pa);
      });
      break;
    default:
      break;
  }
  return out;
}

function dealPillClass(label) {
  const l = (label || "").toLowerCase();
  if (l === "strong" || l === "good") return "strong";
  if (l === "weak" || l === "noise") return "weak";
  return "";
}

function render() {
  const sortKey = document.getElementById("sort").value;
  const rows = sortListings(getFiltered(), sortKey);
  const tbody = document.getElementById("rows");
  const empty = document.getElementById("empty");

  document.getElementById("statTotal").textContent = `${allListings.length} listings`;

  tbody.innerHTML = "";
  if (rows.length === 0) {
    empty.classList.add("show");
    empty.textContent =
      allListings.length === 0
        ? "No listings yet. Open Marketplace, run a search, and scroll—capture runs in the extension while you browse."
        : "No listings match your filters.";
    return;
  }
  empty.classList.remove("show");

  for (const L of rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = L.id;
    const d = dealInfo(L);
    const pillClass = dealPillClass(d.label);
    const reasonText = (d.reasons && d.reasons.length ? d.reasons.join(" · ") : "").slice(0, 140);
    const thumb = L.thumb
      ? `<img class="thumb" src="${escapeAttr(L.thumb)}" alt="" loading="lazy" />`
      : `<div class="thumb"></div>`;
    tr.innerHTML = `
      <td>${thumb}</td>
      <td class="title-cell">
        <a href="${escapeAttr(L.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(L.title)}</a>
        ${L.sourcePage ? `<span class="meta">${escapeHtml(shortUrl(L.sourcePage))}</span>` : ""}
      </td>
      <td class="price-cell">${escapeHtml(L.price || "—")}</td>
      <td class="loc-cell">${escapeHtml(L.location || "—")}</td>
      <td class="narrow-col dist-cell" data-role="dist">${escapeHtml(formatDistCell(L))}</td>
      <td class="deal-col">
        <span class="deal-pill ${pillClass}">${escapeHtml(String(d.score))} · ${escapeHtml(d.label)}</span>
        ${reasonText ? `<span class="deal-reason">${escapeHtml(reasonText)}</span>` : ""}
      </td>
      <td class="date-cell">${escapeHtml(formatDate(L.capturedAt))}</td>
      <td class="link-cell"><a href="${escapeAttr(L.url)}" target="_blank" rel="noopener">Open</a></td>
    `;
    tbody.appendChild(tr);
  }

  startDistancePass(rows);
}

function shortUrl(u) {
  try {
    const x = new URL(u);
    return x.pathname + (x.search ? " …" : "");
  } catch {
    return u.slice(0, 80);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

async function startDistancePass(rows) {
  if (distanceBusy) return;
  if (shelfUi.refLat == null || shelfUi.refLon == null) return;

  const need = rows.filter((L) => L.location && !distKmCache.has(L.id));
  if (need.length === 0) return;

  distanceBusy = true;
  try {
    for (const L of need) {
      try {
        const locKey = L.location.trim();
        const pt = await ShelfGeo.geocode(locKey, geoCache);
        scheduleGeoSave();
        if (!pt) continue;
        const km = ShelfGeo.haversineKm(shelfUi.refLat, shelfUi.refLon, pt.lat, pt.lon);
        distKmCache.set(L.id, km);
        const row = document.querySelector('tr[data-id="' + String(L.id) + '"] .dist-cell');
        if (row) row.textContent = formatDist(km);
      } catch {
        /* skip */
      }
    }
    const sortKey = document.getElementById("sort").value;
    if (sortKey === "dist-asc") render();
  } finally {
    distanceBusy = false;
  }
}

function download(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportJson() {
  download(
    `listing-shelf-${Date.now()}.json`,
    "application/json",
    JSON.stringify(allListings, null, 2)
  );
}

function exportCsv() {
  const rows = sortListings(getFiltered(), document.getElementById("sort").value);
  const cols = [
    "id",
    "title",
    "price",
    "location",
    "distanceKm",
    "dealScore",
    "dealLabel",
    "url",
    "capturedAt",
    "sourcePage",
  ];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const L of rows) {
    const km = distKmCache.get(L.id);
    const di = dealInfo(L);
    const rec = {
      id: L.id,
      title: L.title,
      price: L.price,
      location: L.location,
      distanceKm: km == null ? "" : String(km),
      dealScore: di.score,
      dealLabel: di.label,
      url: L.url,
      capturedAt: L.capturedAt,
      sourcePage: L.sourcePage,
    };
    lines.push(cols.map((c) => esc(rec[c])).join(","));
  }
  download(`listing-shelf-${Date.now()}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
}

function renderDiagnostics(shelfDebug) {
  const el = document.getElementById("diagJson");
  if (!el) return;
  if (!shelfDebug) {
    el.textContent =
      "No diagnostic record yet. Open a Marketplace tab, scroll listings, then click Refresh—or use the popup “Test capture”.";
    return;
  }
  el.textContent = JSON.stringify(shelfDebug, null, 2);
}

function load() {
  chrome.storage.local.get(["listings", "shelfDebug", "geoCache", "shelfUi"], (r) => {
    allListings = Array.isArray(r.listings) ? r.listings : [];
    geoCache = r.geoCache && typeof r.geoCache === "object" ? r.geoCache : {};
    if (r.shelfUi && typeof r.shelfUi === "object") {
      shelfUi = { ...shelfUi, ...r.shelfUi };
    }
    document.getElementById("refTown").value = shelfUi.refTown || "";
    document.getElementById("distUnit").value = shelfUi.distanceUnit === "km" ? "km" : "mi";
    document.getElementById("hidePlaceholder").checked = shelfUi.hidePlaceholderOffers !== false;
    document.getElementById("pinGreat").checked = shelfUi.pinGreat !== false;

    distKmCache.clear();
    renderDiagnostics(r.shelfDebug);
    render();
  });
}

function persistShelfUi() {
  shelfUi.refTown = document.getElementById("refTown").value.trim();
  shelfUi.distanceUnit = document.getElementById("distUnit").value === "km" ? "km" : "mi";
  shelfUi.hidePlaceholderOffers = document.getElementById("hidePlaceholder").checked;
  shelfUi.pinGreat = document.getElementById("pinGreat").checked;
  chrome.storage.local.set({ shelfUi });
}

document.getElementById("q").addEventListener("input", render);
document.getElementById("sort").addEventListener("change", render);
document.getElementById("minP").addEventListener("input", render);
document.getElementById("maxP").addEventListener("input", render);
document.getElementById("hidePlaceholder").addEventListener("change", () => {
  persistShelfUi();
  render();
});
document.getElementById("pinGreat").addEventListener("change", persistShelfUi);
document.getElementById("distUnit").addEventListener("change", () => {
  persistShelfUi();
  render();
});

document.getElementById("saveRef").addEventListener("click", async () => {
  persistShelfUi();
  distKmCache.clear();
  const q = document.getElementById("refTown").value.trim();
  shelfUi.refTown = q;
  if (!q) {
    shelfUi.refLat = null;
    shelfUi.refLon = null;
    chrome.storage.local.set({ shelfUi });
    render();
    return;
  }
  try {
    const pt = await ShelfGeo.geocode(q, geoCache);
    scheduleGeoSave();
    if (!pt) {
      alert("Could not find that town. Try “City, ST” or a fuller address.");
      return;
    }
    shelfUi.refLat = pt.lat;
    shelfUi.refLon = pt.lon;
    chrome.storage.local.set({ shelfUi, geoCache });
    render();
  } catch (e) {
    alert(String(e.message || e));
  }
});

document.getElementById("rescoreDeals").addEventListener("click", async () => {
  const btn = document.getElementById("rescoreDeals");
  btn.disabled = true;
  const next = [];
  try {
    for (const L of allListings) {
      const d = await ShelfDeal.researchDeal(L);
      next.push({
        ...L,
        dealMeta: { ...d, at: new Date().toISOString() },
      });
    }
    allListings = next;
    chrome.storage.local.set({ listings: allListings }, () => {
      render();
    });
  } catch (e) {
    alert(String(e.message || e));
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("exportJson").addEventListener("click", exportJson);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("Remove all saved listings from this extension?")) return;
  chrome.storage.local.set({ listings: [] }, load);
});

document.getElementById("refreshDiag").addEventListener("click", () => {
  chrome.storage.local.get(["shelfDebug"], (r) => renderDiagnostics(r.shelfDebug));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.listings || changes.shelfDebug || changes.shelfUi)) load();
});

load();
