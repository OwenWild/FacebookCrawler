# Marketplace Listing Shelf

Chrome extension that **saves Facebook Marketplace listings as you browse** (same logged-in Chrome you already use) and opens a **local shelf** page to search, sort by price, and export CSV/JSON.

## Install (Windows / any OS with Chrome)

1. Open Chrome → **Extensions** (`chrome://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder: `extension` (the one that contains `manifest.json`).

## Use

1. Pin the extension if you like (puzzle icon → pin “Marketplace Listing Shelf”).
2. Go to [Facebook Marketplace](https://www.facebook.com/marketplace/) and run your search or open a category.
3. **Scroll** so more results load. The extension reads the page and stores listing links, titles, and prices when it can detect them.
4. Click the extension icon → **Open shelf & search** for the full table, filters, and export.

Optional: enable **Gentle scroll to load more** in the popup so the page scrolls slowly to pull in more items (still your session; stop by turning it off or leaving Marketplace).

## Notes

- Data is stored in **Chrome’s local storage** for this profile only.
- Facebook changes their page structure sometimes; if capture misses fields, scroll again or open a listing detail page.
- You are responsible for using Facebook/Meta products according to their terms.
