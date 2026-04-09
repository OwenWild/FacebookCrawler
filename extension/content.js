(() => {
  const ITEM_RE = /\/marketplace\/item\/(\d{8,20})/;
  const PRICE_RE =
    /(\$|€|£|CA\$|A\$)\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|CAD|AUD)\b|Free\b/i;

  let settings = { autoCapture: true, scrollAssist: false, scrollAssistMax: 25 };
  let debounceTimer = null;
  let scrollCount = 0;
  let scrollTimer = null;

  function loadSettings() {
    chrome.storage.local.get(["settings"], (r) => {
      if (r.settings) settings = { ...settings, ...r.settings };
      syncScrollAssist();
    });
  }

  function syncScrollAssist() {
    if (scrollTimer) {
      clearInterval(scrollTimer);
      scrollTimer = null;
    }
    scrollCount = 0;
    if (!settings.scrollAssist || !settings.autoCapture) return;
    const max = Math.min(100, Math.max(5, settings.scrollAssistMax || 25));
    scrollTimer = setInterval(() => {
      if (scrollCount >= max) {
        clearInterval(scrollTimer);
        scrollTimer = null;
        return;
      }
      const el = document.scrollingElement || document.documentElement;
      const before = el.scrollTop;
      el.scrollBy({ top: window.innerHeight * 0.85, behavior: "smooth" });
      scrollCount += 1;
      setTimeout(() => {
        if (el.scrollTop === before) {
          clearInterval(scrollTimer);
          scrollTimer = null;
        }
      }, 800);
    }, 2800);
  }

  function normalizeUrl(id) {
    return `https://www.facebook.com/marketplace/item/${id}/`;
  }

  function guessPrice(text) {
    if (!text) return null;
    const m = text.match(PRICE_RE);
    return m ? m[0].trim() : null;
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

  function findThumb(el) {
    let n = el;
    for (let i = 0; i < 8 && n; i++) {
      const img = n.querySelector?.(
        'img[src*="scontent"], img[src*="fbcdn"], img[src*="instagram"]'
      );
      if (img?.src) return img.src;
      n = n.parentElement;
    }
    return null;
  }

  function collectFromAnchors() {
    const anchors = document.querySelectorAll('a[href*="/marketplace/item/"]');
    const batch = [];
    anchors.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const m = href.match(ITEM_RE);
      if (!m) return;
      const id = m[1];
      const label = a.getAttribute("aria-label") || "";
      const container =
        a.closest('[role="article"]') ||
        a.closest("div[data-pagelet]") ||
        a.parentElement?.parentElement?.parentElement;
      const blob = [label, container?.innerText || ""].join("\n").slice(0, 4000);
      const price = guessPrice(blob) || guessPrice(label);
      let title = extractTitleFromLabel(label, price);
      if (!title && container) {
        const lines = container.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
        title = lines.find((l) => l.length > 3 && l.length < 200 && !PRICE_RE.test(l)) || null;
      }
      if (!title) title = `Listing ${id}`;

      batch.push({
        id,
        url: normalizeUrl(id),
        title: title.slice(0, 300),
        price: price || null,
        location: null,
        thumb: findThumb(a),
        capturedAt: new Date().toISOString(),
        sourcePage: location.href.split("?")[0],
      });
    });
    return batch;
  }

  function capturePdp() {
    const m = location.pathname.match(/\/marketplace\/item\/(\d{8,20})/);
    if (!m) return [];
    const id = m[1];
    const og =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const title =
      og ||
      document.title.replace(/\s*\|\s*Facebook\s*Marketplace.*$/i, "").trim() ||
      `Listing ${id}`;
    const body = document.body?.innerText?.slice(0, 6000) || "";
    return [
      {
        id,
        url: normalizeUrl(id),
        title: title.slice(0, 300),
        price: guessPrice(body) || guessPrice(document.title),
        location: null,
        thumb:
          document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null,
        capturedAt: new Date().toISOString(),
        sourcePage: location.href.split("?")[0],
      },
    ];
  }

  function goodTitle(t, id) {
    return !!(t && String(t).trim() !== `Listing ${id}` && String(t).trim().length > 2);
  }

  function mergeListings(existing, incoming) {
    const map = new Map();
    existing.forEach((x) => map.set(x.id, x));
    incoming.forEach((x) => {
      const prev = map.get(x.id);
      if (!prev) map.set(x.id, x);
      else {
        const title = goodTitle(x.title, x.id)
          ? x.title
          : goodTitle(prev.title, x.id)
            ? prev.title
            : x.title;
        map.set(x.id, {
          ...prev,
          ...x,
          title,
          price: x.price || prev.price,
          thumb: x.thumb || prev.thumb,
          capturedAt: x.capturedAt,
        });
      }
    });
    return Array.from(map.values());
  }

  function flush() {
    if (!settings.autoCapture) return;
    chrome.storage.local.get(["listings"], (r) => {
      const existing = Array.isArray(r.listings) ? r.listings : [];
      const isPdp = /\/marketplace\/item\/\d+/.test(location.pathname);
      const incoming = isPdp ? capturePdp() : collectFromAnchors();
      if (incoming.length === 0) return;
      const merged = mergeListings(existing, incoming);
      merged.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
      const cap = 8000;
      chrome.storage.local.set({
        listings: merged.slice(0, cap),
      });
    });
  }

  function scheduleFlush() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flush, 450);
  }

  const obs = new MutationObserver(() => scheduleFlush());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("scroll", scheduleFlush, { passive: true });
  window.addEventListener("load", () => {
    loadSettings();
    scheduleFlush();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = { ...settings, ...changes.settings.newValue };
    syncScrollAssist();
  });

  loadSettings();
  scheduleFlush();
})();
