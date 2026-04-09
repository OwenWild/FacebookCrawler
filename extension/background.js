chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["settings", "listings"], (data) => {
    if (!data.settings) {
      chrome.storage.local.set({
        settings: { autoCapture: true, scrollAssist: false, scrollAssistMax: 25 },
      });
    }
    if (!data.listings) {
      chrome.storage.local.set({ listings: [] });
    }
  });
});
