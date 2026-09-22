# ParkPulse v1.2 — Ride Watcher

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
- Installable/offline-capable PWA shell with light/dark/system appearance.

ParkPulse is independent and is not affiliated with Disney. ThemeParks.wiki attribution is required by its free-tier terms. Queue-Times attribution is retained because it remains the fallback source.

## Data flow

```text
ThemeParks.wiki
      │ primary
      ▼
Cloudflare Worker ── Queue-Times fallback
      │
      ├─ curated ride catalogue
      ├─ provider-independent ride IDs
      ├─ stale-state handling
      └─ push alert evaluation
      │
      ▼
ParkPulse PWA
```

The Worker polls on the existing five-minute schedule. ThemeParks.wiki recommends not polling live data more frequently than every five minutes.

## Deploying the 1.2 migration

The static frontend publishes through GitHub Pages. The Worker needs one database migration and redeploy:

```bash
cd /workspaces/park-pulse-web
git pull origin main

cd worker
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql
npm run deploy
```

The schema migration is non-destructive. Existing subscriptions, VAPID keys, and legacy ride-state tables remain in place. Existing saved watches are migrated by park + ride name when the new PWA sees the normalized ride catalogue.

No ThemeParks.wiki API key is required for the live REST calls used by ParkPulse.
