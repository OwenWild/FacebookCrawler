(() => {
  const segs = location.pathname.split("/").filter(Boolean);
  if (!segs.includes("marketplace")) return;

  const ITEM_RE = /\/marketplace\/item\/(\d{8,22})/i;
  const ITEM_RE_ENCODED = /marketplace[%2F\\]+item[%2F\\]+(\d{8,22})/i;
  const PRICE_RE =
    /(\$|€|£|CA\$|A\$)\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*(?:USD|EUR|GBP|CAD|AUD)\b|Free\b/i;

  let settings = {
    autoCapture: true,
    scrollAssist: false,
    scrollAssistMax: 25,
    debug: false,
  };
  let debounceTimer = null;
  let scrollCount = 0;
  let scrollTimer = null;
  let overlayEl = null;

  function log(...args) {
    if (settings.debug) console.log("[Listing Shelf]", ...args);
  }

  function writeShelfDebug(payload) {
    chrome.storage.local.set({
      shelfDebug: { ...payload, at: new Date().toISOString(), href: location.href },
    });
  }

  function updateOverlay(text, showHud) {
    if (!showHud) {
      if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
      }
      return;
    }
    if (!overlayEl) {
      overlayEl = document.createElement("div");
      overlayEl.style.cssText =
        "position:fixed;right:8px;top:8px;z-index:2147483647;max-width:min(360px,92vw);" +
        "background:#1a1d23ee;color:#e8eaed;font:12px/1.35 system-ui,sans-serif;padding:10px 12px;" +
        "border-radius:8px;border:1px solid #3c4043;box-shadow:0 4px 16px #0008;white-space:pre-wrap;pointer-events:none;";
      document.documentElement.appendChild(overlayEl);
    }
    overlayEl.textContent = text;
  }

  function loadSettings(cb) {
    chrome.storage.local.get(["settings"], (r) => {
      if (r.settings) settings = { ...settings, ...r.settings };
      syncScrollAssist();
      if (cb) cb();
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

  function extractItemIdFromHref(href) {
    if (!href) return null;
    let m = href.match(ITEM_RE);
    if (m) return m[1];
    m = decodeURIComponent(href).match(ITEM_RE);
    if (m) return m[1];
    m = href.match(ITEM_RE_ENCODED);
    if (m) return m[1];
    try {
      const u = new URL(href, location.origin);
      m = u.pathname.match(ITEM_RE);
      if (m) return m[1];
    } catch {
      /* ignore */
    }
    return null;
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

  function looksLikePlaceLine(line) {
    if (!line || line.length < 3 || line.length > 120) return false;
    if (/^\$|€|£/.test(line)) return false;
    if (/\bfree\b/i.test(line) && line.length < 12) return false;
    if (/,\s*[A-Z]{2}(\s|$|,)/.test(line)) return true;
    if (/,\s*[A-Za-z][a-z]+\s*[A-Za-z][a-z]+/.test(line) && line.includes(",")) return true;
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
    const candidates = document.querySelectorAll(
      'a[href*="marketplace/item"], a[href*="Marketplace/item"], a[href*="MARKETPLACE/ITEM"]'
    );
    const batch = [];
    const seen = new Set();
    candidates.forEach((a) => {
      const raw = a.getAttribute("href") || "";
      const resolved = a.href || raw;
      const id = extractItemIdFromHref(resolved) || extractItemIdFromHref(raw);
      if (!id || seen.has(id)) return;
      seen.add(id);

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

      const loc = extractLocation(label, title, container?.innerText || "", price);
      const snippet = blob.slice(0, 1200);

      batch.push({
        id,
        url: normalizeUrl(id),
        title: title.slice(0, 300),
        price: price || null,
        location: loc,
        snippet,
        thumb: findThumb(a),
        capturedAt: new Date().toISOString(),
        sourcePage: location.href.split("?")[0],
      });
    });
    return batch;
  }

  function capturePdp() {
    const m = location.pathname.match(/\/marketplace\/item\/(\d{8,22})/);
    if (!m) return [];
    const id = m[1];
    const og =
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
    const title =
      og ||
      document.title.replace(/\s*\|\s*Facebook\s*Marketplace.*$/i, "").trim() ||
      `Listing ${id}`;
    const body = document.body?.innerText?.slice(0, 6000) || "";
    const loc =
      extractLocation("", title, body, guessPrice(body) || "") ||
      (() => {
        const m = body.match(
          /Location\s*[·•\-:]*\s*([^\n]+)/i
        );
        return m ? m[1].trim().slice(0, 160) : null;
      })();
    return [
      {
        id,
        url: normalizeUrl(id),
        title: title.slice(0, 300),
        price: guessPrice(body) || guessPrice(document.title),
        location: loc,
        snippet: body.slice(0, 1200),
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
          location: x.location || prev.location,
          snippet:
            (x.snippet && x.snippet.length > (prev.snippet || "").length
              ? x.snippet
              : prev.snippet) || x.snippet,
          thumb: x.thumb || prev.thumb,
          capturedAt: x.capturedAt,
        });
      }
    });
    return Array.from(map.values());
  }

  function sampleMarketplaceHrefs() {
    const out = [];
    const all = document.querySelectorAll("a[href]");
    const max = 400;
    let n = 0;
    for (let i = 0; i < all.length && n < max; i++) {
      const h = all[i].getAttribute("href") || "";
      if (h.includes("marketplace") && h.length < 500) {
        out.push(h.slice(0, 220));
        n++;
        if (out.length >= 8) break;
      }
    }
    return out;
  }

  function flush(reason) {
    chrome.storage.local.get(["listings", "settings"], (r) => {
      const st = { ...settings, ...(r.settings || {}) };
      settings = st;

      const dbg = {
        reason: reason || "auto",
        pathname: location.pathname,
        autoCapture: st.autoCapture !== false,
        isPdp: /\/marketplace\/item\/\d+/.test(location.pathname),
      };

      if (st.autoCapture === false) {
        dbg.result = "skipped";
        dbg.note = "Capture is off (popup: Capture while I browse).";
        writeShelfDebug(dbg);
        log("skip: autoCapture off");
        updateOverlay(dbg.note, !!st.debug);
        return;
      }

      const existing = Array.isArray(r.listings) ? r.listings : [];
      const isPdp = dbg.isPdp;
      const rawAnchors = document.querySelectorAll(
        'a[href*="marketplace/item"], a[href*="Marketplace/item"]'
      );
      dbg.anchorNodes = rawAnchors.length;
      dbg.sampleHrefs = sampleMarketplaceHrefs();

      const incoming = isPdp ? capturePdp() : collectFromAnchors();
      dbg.incomingCount = incoming.length;
      dbg.savedTotalAfter = existing.length;

      if (incoming.length === 0) {
        dbg.result = "no_items";
        dbg.note =
          rawAnchors.length === 0
            ? "No <a href*=/marketplace/item/> nodes found. Scroll the feed or open a category; if this persists, Facebook may have changed the DOM."
            : "Found link nodes but could not parse item IDs. Check sample hrefs below.";
        writeShelfDebug(dbg);
        log("flush: 0 items", dbg);
        updateOverlay(
          `Shelf: 0 new\nanchors: ${rawAnchors.length}\n` +
            (dbg.sampleHrefs.length ? `sample:\n${dbg.sampleHrefs.slice(0, 3).join("\n")}` : ""),
          !!st.debug
        );
        return;
      }

      const merged = mergeListings(existing, incoming);
      merged.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));
      const cap = 8000;
      const sliced = merged.slice(0, cap);

      chrome.storage.local.set(
        {
          listings: sliced,
          shelfDebug: {
            ...dbg,
            result: "ok",
            incomingCount: incoming.length,
            savedTotalAfter: sliced.length,
            note: `Merged ${incoming.length} listing(s); total ${sliced.length}.`,
          },
        },
        () => {
          const err = chrome.runtime.lastError;
          if (err) {
            writeShelfDebug({
              ...dbg,
              result: "storage_error",
              note: String(err.message || err),
            });
            log("storage error", err);
            updateOverlay(`Storage error: ${err.message}`, !!st.debug);
            return;
          }
          log("saved", incoming.length, "total", sliced.length);
          updateOverlay(`Shelf: +${incoming.length} (total ${sliced.length})`, !!st.debug);
        }
      );
    });
  }

  function scheduleFlush(reason) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => flush(reason), 450);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "SHELF_PING") {
      sendResponse({
        ok: true,
        pathname: location.pathname,
        href: location.href,
        hasMarketplaceSegment: true,
      });
      return false;
    }
    if (msg?.type === "SHELF_RUN_CAPTURE") {
      loadSettings(() => {
        flush("manual_test");
        setTimeout(() => {
          chrome.storage.local.get(["shelfDebug", "listings"], (r) => {
            const n = Array.isArray(r.listings) ? r.listings.length : 0;
            sendResponse({
              ok: true,
              shelfDebug: r.shelfDebug || null,
              listingsCount: n,
            });
          });
        }, 1200);
      });
      return true;
    }
    return false;
  });

  const obs = new MutationObserver(() => scheduleFlush("mutation"));
  obs.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("scroll", () => scheduleFlush("scroll"), { passive: true });
  window.addEventListener("load", () => {
    loadSettings(() => {
      scheduleFlush("load");
    });
  });

  setInterval(() => {
    scheduleFlush("interval");
  }, 8000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.settings) return;
    settings = { ...settings, ...changes.settings.newValue };
    syncScrollAssist();
    if (changes.settings.newValue?.debug !== undefined) {
      updateOverlay("", !!settings.debug);
    }
  });

  loadSettings(() => {
    scheduleFlush("init");
  });
})();
