# Marketplace Listing Shelf

Chrome extension that **saves Facebook Marketplace listings as you browse** (same logged-in Chrome you already use) and opens a **local shelf** page to search, sort by price, and export CSV/JSON.

## Install (Windows / any OS with Chrome)

1. Open Chrome → **Extensions** (`chrome://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this folder: `extension` (the one that contains `manifest.json`).

### Open the shelf from Windows (one click)

After the extension is loaded once, double-click **`OpenListingShelf.cmd`** in this project folder. It finds Chrome, resolves the extension ID for this folder, and opens the Listing Shelf tab. If the extension is not installed yet, it opens `chrome://extensions` and shows what to do.

**If the launcher still says the extension is missing:** go to `chrome://extensions` → Developer mode ON → find **Marketplace Listing Shelf** → copy the **ID** (32 letters `a`–`p`). Create a file named **`ShelfExtensionId.txt`** in this project folder (same folder as `OpenListingShelf.cmd`), paste the ID as the only line, save. If the shelf opens in the wrong Chrome profile, add **`ShelfChromeProfile.txt`** with one line: your profile folder name (`Default`, `Profile 1`, etc.—open `chrome://version` and check **Profile path**).

After updating the extension files, open `chrome://extensions` and click **Reload** on this extension (v1.0.2+ adds diagnostics and broader link parsing).

### Nothing saves / debugging

1. On `chrome://extensions`, confirm **Marketplace Listing Shelf** is **enabled** and click **Reload** after updates.
2. Open the extension popup → **Insert test listing** — if the shelf shows that row, **storage works**; the issue is Facebook’s page not exposing listing links.
3. Stay on a tab whose URL contains **`/marketplace`** (search or category), scroll so tiles load → open the popup → **Test capture on this tab**. Read the text under it, or open the shelf → **Diagnostics** for JSON (`anchorNodes`, `sampleHrefs`, `note`).
4. Turn on **Debug (HUD + console)** in the popup, reload the Marketplace tab: you should see a small overlay and `[Listing Shelf]` lines in DevTools (F12 → Console).

You can **pin a shortcut**: right‑click `OpenListingShelf.cmd` → **Send to** → **Desktop (create shortcut)**.

## Use

1. Pin the extension if you like (puzzle icon → pin “Marketplace Listing Shelf”).
2. Go to [Facebook Marketplace](https://www.facebook.com/marketplace/) and run your search or open a category.
3. **Scroll** so more results load. The extension reads the page and stores listing links, titles, prices, **location** (when visible), and a short **snippet** for deal/offer detection.
4. Click the extension icon → **Open shelf & search** for the full table, filters, and export.

### Shelf: distance & deals

- Enter **Your town (for distance)** → **Save**. Distances use [OpenStreetMap Nominatim](https://nominatim.org/) (rate-limited; results are cached). Pick **Miles** or **Kilometers**.
- **Hide $123 / $1234 + make offer** drops the common placeholder-price + “make offer” clutter (uses title + snippet text).
- **Best deal score first** sorts by the built-in **deal score** (title/snippet heuristics). **Re-run deal research** stores a fresh score on every row (and calls `window.shelfResearchDeal` if you define it for custom logic).
- **Closest first** needs a saved reference town and listing locations; rows show **…** while distances load.

Optional: enable **Gentle scroll to load more** in the popup so the page scrolls slowly to pull in more items (still your session; stop by turning it off or leaving Marketplace).

## Notes

- Data is stored in **Chrome’s local storage** for this profile only.
- Facebook changes their page structure sometimes; if capture misses fields, scroll again or open a listing detail page.
- You are responsible for using Facebook/Meta products according to their terms.
