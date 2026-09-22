# ParkPulse v1.3 — Ride Watcher

ParkPulse is an installable PWA that watches Walt Disney World ride statuses and posted standby waits so you do not have to keep refreshing a park app all day.

## What it does

- Live standby data for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- **ThemeParks.wiki is the primary live source**.
- **Queue-Times is a per-ride fallback**, not the primary feed.
- A curated ParkPulse ride catalogue filters out shows, character experiences, and single-rider-only queue entries.
- Provider-independent ParkPulse ride keys keep watches stable if a data provider changes.
- Per-ride alerts for **reopening** and **wait at/below a chosen target**.
- Watch durations: park day, three hours, or until disabled.
- Web Push through Cloudflare Worker + D1, including while the PWA is closed.
- Anonymous device subscriptions; no account system required.
- 30-minute alert cooldowns, stale-data labels, last-known-state fallback, notification testing, and diagnostics.
- A rolling 30-day ParkPulse wait-history table sampled by the five-minute Worker cron.
- Ride-sheet trend insights including today's observed low/high and, once enough history exists, the typical wait around the current time of day.
- Installable/offline-capable PWA shell with light/dark/system appearance.

ParkPulse is independent and is not affiliated with Disney. ThemeParks.wiki attribution is required by its free-tier terms. Queue-Times attribution is retained because it remains the fallback source.

## ThemeParks.wiki API key

The live feed works without a key, but ParkPulse supports a free ThemeParks.wiki API key as a **Cloudflare Worker secret**. Never put the key in the PWA, GitHub, `wrangler.toml`, or a committed `.env` file.

Create a free key from your ThemeParks.wiki account, then add it from the Worker directory:

```bash
cd /workspaces/park-pulse-web/worker
npx wrangler secret put THEMEPARKS_API_KEY
```

Paste the key only into Wrangler's hidden terminal prompt.

When configured, the Worker sends it in the `x-api-key` header to ThemeParks.wiki. The `/health` response exposes only a boolean indicating whether a key is configured; it never returns the key itself.

## Data flow

```text
ThemeParks.wiki
      │ primary
      ▼
Cloudflare Worker ── Queue-Times fallback
      │
      ├─ curated ride catalogue
      ├─ provider-independent ride IDs
      ├─ rolling D1 wait history
      ├─ ride trend insights
      ├─ stale-state handling
      └─ push alert evaluation
      │
      ▼
ParkPulse PWA
```

The Worker polls on the existing five-minute schedule. ParkPulse keeps only a rolling 31-day operational history of its own live observations for product analytics.

## Deploying the 1.3 migration

The static frontend publishes through GitHub Pages. The Worker needs one non-destructive D1 migration and redeploy:

```bash
cd /workspaces/park-pulse-web
git pull origin main

cd worker
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql

# Run once after creating your free ThemeParks.wiki key:
npx wrangler secret put THEMEPARKS_API_KEY

npm run deploy
```

Existing subscriptions, VAPID keys, and legacy ride-state tables remain in place. Existing saved watches continue using the provider-independent ride catalogue.

Trend insights intentionally degrade gracefully: today's range appears after multiple samples have been collected, while "Typical now" waits until there are enough comparable historical samples to avoid pretending a tiny sample is meaningful.
