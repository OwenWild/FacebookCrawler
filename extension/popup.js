function refreshCount() {
  chrome.storage.local.get(["listings"], (r) => {
    const n = Array.isArray(r.listings) ? r.listings.length : 0;
    document.getElementById("count").textContent = String(n);
  });
}

function loadSettings() {
  chrome.storage.local.get(["settings"], (r) => {
    const s = r.settings || {};
    document.getElementById("auto").checked = s.autoCapture !== false;
    document.getElementById("scroll").checked = !!s.scrollAssist;
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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.listings) refreshCount();
});

loadSettings();
refreshCount();
