/** @typedef {{ id: string, url: string, title: string, price: string | null, thumb: string | null, capturedAt: string, sourcePage?: string }} Listing */

let allListings = [];

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

function getFiltered() {
  const q = document.getElementById("q").value.trim().toLowerCase();
  const minRaw = document.getElementById("minP").value.trim();
  const maxRaw = document.getElementById("maxP").value.trim();
  const minN = minRaw === "" ? NaN : parseFloat(minRaw);
  const maxN = maxRaw === "" ? NaN : parseFloat(maxRaw);

  return allListings.filter((L) => {
    const hay = [L.title, L.price || "", L.url, L.sourcePage || ""].join(" ").toLowerCase();
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
  const out = [...list];
  switch (key) {
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
        : "No listings match your search or price filters.";
    return;
  }
  empty.classList.remove("show");

  for (const L of rows) {
    const tr = document.createElement("tr");
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
      <td class="date-cell">${escapeHtml(formatDate(L.capturedAt))}</td>
      <td class="link-cell"><a href="${escapeAttr(L.url)}" target="_blank" rel="noopener">Open</a></td>
    `;
    tbody.appendChild(tr);
  }
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
  const cols = ["id", "title", "price", "url", "capturedAt", "sourcePage"];
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [cols.join(",")];
  for (const L of rows) {
    lines.push(cols.map((c) => esc(L[c])).join(","));
  }
  download(`listing-shelf-${Date.now()}.csv`, "text/csv;charset=utf-8", lines.join("\n"));
}

function load() {
  chrome.storage.local.get(["listings"], (r) => {
    allListings = Array.isArray(r.listings) ? r.listings : [];
    render();
  });
}

document.getElementById("q").addEventListener("input", render);
document.getElementById("sort").addEventListener("change", render);
document.getElementById("minP").addEventListener("input", render);
document.getElementById("maxP").addEventListener("input", render);

document.getElementById("exportJson").addEventListener("click", exportJson);
document.getElementById("exportCsv").addEventListener("click", exportCsv);
document.getElementById("clear").addEventListener("click", () => {
  if (!confirm("Remove all saved listings from this extension?")) return;
  chrome.storage.local.set({ listings: [] }, load);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.listings) load();
});

load();
