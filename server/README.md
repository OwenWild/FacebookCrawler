# Headless Marketplace sweeper (Ubuntu / server)

**Docker** (from the **repo root**, where `docker-compose.yml` and `config.json` live):

```bash
docker compose up -d --build   # start (rebuild if code/Dockerfile changed)
docker compose down             # stop
docker compose logs -f --tail=50
```

Runs **priority category URLs first** (vehicles, bicycles, electronics, computers/macbook searches, etc.), then **remaining** categories if there is time left in the cycle. It uses **Playwright Chromium** with a **saved Facebook session** (storage state), scrolls each page to load tiles, extracts listings, scores them with the same heuristics as the browser extension, optionally filters by **distance** from `refTown`, and **notifies** you (webhook and/or email) when a listing crosses `dealScoreMin`.

**Important**

- Automating Facebook may violate Meta’s terms. Use at your own risk; prefer official APIs where they exist.
- **“Newest first”** is not enforced in code (Facebook changes URLs often). For each category, open Marketplace in a normal browser, set **Date listed: Newest first**, copy the **full URL** from the address bar into `config.json`. Do that for search URLs too (`macbook`, `computer`, etc.).
- **`npm start`** (per-listing webhook/email): first run **seeds** `seen-ids.json` and sends **no** per-item notifications. Later runs only notify on **new** IDs.
- **`npm run discord`**: first run **posts that initial batch to Discord** (title starts with “Initial snapshot”), then tracks IDs so later runs only send **new** listings.

## Quick start

```bash
cd server
cp config.example.json config.json
# Edit config.json: categories, notifyWebhookUrl or notifyEmail, storageStatePath, refTown optional
npm install
npx playwright install-deps chromium   # Ubuntu: system libs
npm run install-browser
```

### Create `storage-state.json` (logged-in session)

On a **Windows/Mac machine with a normal browser** (your laptop):

```bash
cd server
npm run save-session
```

A Chromium window opens → log into Facebook / Marketplace (2FA if needed) → when it works, **press Enter** in the terminal. The JSON path is printed; it matches `storageStatePath` in your `config.json` (paths are resolved **relative to the config file**, e.g. repo `config.json` → `data/storage-state.json` next to it).

**Copy to Ubuntu:** copy that single file to the **same path** on the server (same folder layout as this repo), e.g.:

```bash
scp data/storage-state.json user@your-server:~/FacebookCrawler/data/storage-state.json
```

Then on the server, run commands from `server/` with the same `config.json` (or set `MARKETPLACE_CONFIG_PATH` to the full path of `config.json`).

### Run

```bash
cd server
npm start
```

One shot (single sweep, then exit):

```bash
npm run once
```

Config path override:

```bash
MARKETPLACE_CONFIG_PATH=/path/to/config.json npm start
```

## Timing

- **`priorityTimeBudgetMs`**: stop running the **priority** list after this much time (default 15 min).
- **`maxCycleDurationMs`**: stop the **entire** sweep (priority + remainder) after this much time (default 45 min).
- **`cycleIntervalMinutes`**: wait between full sweeps when using `npm start`.
- **`perCategoryMaxMs`**: soft cap logged per category (scrape still finishes the current page).

## Notifications

- **`notifyWebhookUrl`**: `POST` JSON `{ v, at, listing, deal, meta }`.
- **`notifyEmail`**: set `enabled: true` and SMTP fields; password from `passEnv` (e.g. `SMTP_PASS` in the environment).

If neither is configured, qualifying deals are printed to stdout.

## systemd (example)

```ini
[Unit]
Description=Marketplace shelf sweeper
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/marketplace-shelf/server
Environment=NODE_ENV=production
Environment=SMTP_PASS=your-secret
ExecStart=/usr/bin/node src/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

## Custom “research”

The server uses the same **`scoreDeal`** heuristics as `server/src/deal.js`. Edit that file or add your own model/API and call it from `processNewListings` in `runner.js` before `notifyListing`.

---

## Discord digest every 30 minutes (recommended)

Posts **one batched message** (embeds) with **new** listings since the last run, **sorted by deal score** (best first), then distance. Only listings **inside** `maxDistanceMiles` of `refTown` are included (you need both; listings without a parsed location are skipped).

### 1. Create a webhook

In Discord: **Channel settings → Integrations → Webhooks → New Webhook** → copy the **Webhook URL**.

### 2. Configure `config.json`

```json
"discordWebhookUrl": "https://discord.com/api/webhooks/…",
"digestIntervalMinutes": 30,
"digestMinDealScore": 0,
"refTown": "Your City, ST",
"maxDistanceMiles": 25,
"digestPostWhenEmpty": false
```

Use **`digestMinDealScore`** to hide weak heuristics (e.g. `60`). **`digestPostWhenEmpty`**: if `true`, Discord gets a “no new listings” ping each run.

### 3. Run (terminal)

From the `server` folder (after `npm install`, Playwright browser, and `data/storage-state.json` — see above):

```bash
npm run discord
```

One manual test:

```bash
npm run discord-once
```

The **first run** (empty `seen-ids.json`) posts an **initial snapshot** to Discord (same filters as later runs), then records IDs so the next run only sends **new** listings since then.

### 4. Leave it running

Use `tmux`, `screen`, or **systemd** so `npm run discord` stays up after you disconnect SSH.
