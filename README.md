# ParkPulse v1.3.5 — Ride Watcher

ParkPulse is an installable PWA that watches Walt Disney World ride statuses and posted standby waits so you do not have to keep refreshing a park app all day.

## What it does

- Live standby data for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- **ThemeParks.wiki is the primary live source**.
- **Queue-Times is a per-ride fallback**, not the primary feed.
- A fresh fallback record is treated as fully live. A ride is marked **stale only when neither provider has a fresh record**, at which point ParkPulse may show the last known D1 state.
- A curated ParkPulse ride catalogue filters out shows, character experiences, and single-rider-only queue entries.
- Provider-independent ParkPulse ride keys keep watches stable if a data provider changes.
- Per-ride alerts for **reopening** and **wait at/below a chosen target**.
- Watch durations: park day, three hours, or until disabled.
- Web Push through Cloudflare Worker + D1, including while the PWA is closed.
- Anonymous device subscriptions; no account system required.
- 30-minute alert cooldowns, stale-data labels, last-known-state fallback, notification testing, and diagnostics.
- A rolling ParkPulse live-sample history for today's observed low/high.
- Authenticated ThemeParks.wiki 30-day history backfill converted into 15-minute time-of-day baselines.
- Ride trend insights: typical wait now, usual range, today's observed range, and better/busier-than-typical labels.
- **Best now** sorts operating rides by current wait relative to their historical baseline once a baseline is available.
- Installable/offline-capable PWA shell with light/dark/system appearance.
- Mobile touch polish: intentional pinch zoom remains enabled, accidental double-tap zoom is suppressed, iOS form focus avoids auto-zoom, modal scrolling respects safe areas, and search no longer re-mounts while typing.

ParkPulse is independent and is not affiliated with Disney. ThemeParks.wiki attribution is required by its terms. Queue-Times attribution is retained because it remains the fallback source.

## ThemeParks.wiki API key

The API key is stored only as a **Cloudflare Worker secret**. Never put the key in the PWA, GitHub, `wrangler.toml`, or a committed environment file.

```bash
cd /workspaces/park-pulse-web/worker
npx wrangler secret put THEMEPARKS_API_KEY
```

The Worker sends the key in the `x-api-key` header to ThemeParks.wiki. The public health endpoint exposes only whether a key is configured and never returns the secret.

## Historical baseline backfill

ThemeParks.wiki exposes authenticated entity history at:

```text
GET /v1/entity/{id}/history
```

ParkPulse requests the previous 30 completed park-local calendar days for each curated attraction. Raw history is processed inside the Worker and is **not copied into ParkPulse as a mirror**.

For each ride, ParkPulse derives 15-minute time-of-day slots containing:

- time-weighted median standby wait
- 25th percentile standby wait
- 75th percentile standby wait
- time-weighted mean standby wait
- number of observed operating minutes
- number of represented days

Only periods where the attraction is `OPERATING` with a numeric `STANDBY.waitTime` contribute.

The cron refreshes at most four missing/stale ride baselines per five-minute run. A fresh install should therefore fill the WDW catalogue in roughly an hour, subject to provider availability. Successful baselines refresh after 24 hours; failed backfills are eligible to retry after 30 minutes.

The PWA exposes progress in **Settings → Trend baselines**. The Worker also exposes:

```text
GET /api/analytics/status
```

Example:

```json
{
  "ok": true,
  "totalRides": 47,
  "baselineRides": 20,
  "pendingRides": 27,
  "errorRides": 0,
  "backfillComplete": false
}
```

## Data flow

```text
ThemeParks.wiki live + authenticated history
                  │
                  ▼
          Cloudflare Worker ── Queue-Times fallback
                  │
                  ├─ curated ride catalogue
                  ├─ provider-independent ride IDs
                  ├─ 15-minute historical baselines
                  ├─ rolling same-day D1 samples
                  ├─ ride trend/value calculations
                  ├─ stale-state handling
                  └─ push alert evaluation
                  │
                  ▼
              ParkPulse PWA
```

The Worker polls live data on the existing five-minute schedule. D1 writes are grouped through JSON-expanded batch operations to keep database round-trips small.

## Deploying v1.3.5

The frontend publishes through GitHub Pages. The Worker needs the new baseline tables before the new cron code is deployed:

```bash
cd /workspaces/park-pulse-web
git pull origin main

cd worker
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql
npm run deploy
```

The ThemeParks API key secret already configured in Cloudflare persists through ordinary Worker deployments.

After deployment:

```bash
curl -s https://parkpulse-api.jamesp5297.workers.dev/health | python -m json.tool

curl -s https://parkpulse-api.jamesp5297.workers.dev/api/analytics/status | python -m json.tool
```

Existing subscriptions, VAPID keys, ride-state data, and saved watches remain in place.
