function refreshCount() {
  chrome.storage.local.get(["listings", "shelfDebug"], (r) => {
    const n = Array.isArray(r.listings) ? r.listings.length : 0;
    document.getElementById("count").textContent = String(n);
    const d = r.shelfDebug;
    const el = document.getElementById("diag");
    if (!d) {
      el.textContent = "No diagnostics yet. Open Marketplace, then use Test capture.";
      return;
    }
    el.textContent = [
      d.at || "",
      d.result || "",
      d.note || "",
      `anchors: ${d.anchorNodes ?? "?"} incoming: ${d.incomingCount ?? "?"}`,
      d.pathname || "",
    ]
      .filter(Boolean)
      .join("\n");
  });
}

function loadSettings() {
  chrome.storage.local.get(["settings"], (r) => {
    const s = r.settings || {};
    document.getElementById("auto").checked = s.autoCapture !== false;
    document.getElementById("scroll").checked = !!s.scrollAssist;
    document.getElementById("debug").checked = !!s.debug;
  });
}

function activeTabSend(message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      const tab = tabs && tabs[0];
      if (!tab?.id) {
        reject(new Error("No active tab."));
        return;
      }
      chrome.tabs.sendMessage(tab.id, message, (resp) => {
        const e2 = chrome.runtime.lastError;
        if (e2) {
          reject(new Error(e2.message));
          return;
        }
        resolve(resp);
      });
    });
  });
}

document.getElementById("openShelf").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("reload").addEventListener("click", refreshCount);

document.getElementById("auto").addEventListener("change", (e) => {
  chrome.storage.local.get(["settings"], (r) => {
    const s = { ...(r.settings || {}), autoCapture: e.target.checked };
    chrome.storage.local.set({ settings: s });
  });
});

document.getElementById("scroll").addEventListener("change", (e) => {
  chrome.storage.local.get(["settings"], (r) => {
    const s = { ...(r.settings || {}), scrollAssist: e.target.checked };
    chrome.storage.local.set({ settings: s });
  });
});

document.getElementById("debug").addEventListener("change", (e) => {
  chrome.storage.local.get(["settings"], (r) => {
    const s = { ...(r.settings || {}), debug: e.target.checked };
    chrome.storage.local.set({ settings: s });
  });
});

document.getElementById("testCapture").addEventListener("click", async () => {
  const el = document.getElementById("diag");
  el.textContent = "Running…";
  try {
    const resp = await activeTabSend({ type: "SHELF_RUN_CAPTURE" });
    const lines = [
      resp?.ok ? "ok" : "failed",
      `listings in storage: ${resp?.listingsCount ?? "?"}`,
      resp?.shelfDebug ? JSON.stringify(resp.shelfDebug, null, 2) : "(no shelfDebug)",
    ];
    el.textContent = lines.join("\n\n");
    refreshCount();
  } catch (e) {
    el.textContent =
      `Could not talk to this tab.\n\n${e.message || e}\n\n` +
      "Open a Facebook Marketplace tab (URL must contain /marketplace), then try again.";
  }
});

document.getElementById("insertTest").addEventListener("click", () => {
  const id = String(Math.floor(1e15 + Math.random() * 1e14));
  chrome.storage.local.get(["listings"], (r) => {
    const listings = Array.isArray(r.listings) ? [...r.listings] : [];
    listings.unshift({
      id,
      title: "Test listing (safe to delete)",
      price: "$1",
      url: `https://www.facebook.com/marketplace/item/${id}/`,
      capturedAt: new Date().toISOString(),
      sourcePage: "popup:test",
      thumb: null,
      location: null,
    });
    chrome.storage.local.set({ listings }, () => {
      chrome.storage.local.set({
        shelfDebug: {
          at: new Date().toISOString(),
          result: "test_insert",
          note: "Inserted from popup — if you see this row in the shelf, storage works.",
          pathname: "(popup)",
          href: "",
        },
      });
      refreshCount();
    });
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.listings || changes.shelfDebug)) refreshCount();
});

loadSettings();
refreshCount();
