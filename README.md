# ParkPulse v1.4.0 — Ride Watcher

ParkPulse is an installable PWA that watches Walt Disney World ride statuses and posted standby waits so you do not have to keep refreshing a park app all day.

## What it does

- Live standby data for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- Today’s normal park operating hours appear beneath the selected park name, sourced from ThemeParks.wiki’s `OPERATING` schedule entry.
- If the park’s **current local calendar day** contains a `TICKETED_EVENT` schedule entry, ParkPulse shows it directly beneath the normal hours with its event hours. The API description is used when available; otherwise the label is **Special Ticketed Event**. Events from other calendar days are never shown. Extra Hours and private events stay out of this display.
- **ThemeParks.wiki is the primary live source**.
- **Queue-Times is a per-ride fallback**, not the primary feed.
- A fresh fallback record is treated as fully live. A ride is marked **stale only when neither provider has a fresh record**, at which point ParkPulse may show the last known D1 state.
- A curated ParkPulse ride catalogue filters out shows, character experiences, and single-rider-only queue entries.
- Provider-independent ParkPulse ride keys keep watches stable if a data provider changes.
- Per-ride alerts for **reopening** and **wait at/below a chosen target**.
- Watch durations: park day, three hours, or until disabled.
- Web Push through Cloudflare Worker + D1, including while the PWA is closed.
- Standards-based `aes128gcm` Web Push encryption for Safari/iOS and other modern browsers.
- Safe push-test diagnostics report configuration/provider status without exposing VAPID secrets or subscription keys.
- The PWA self-heals a stale browser PushSubscription when its stored application-server key no longer matches the Worker's current VAPID public key.
- Push-service Topic headers are omitted; notification replacement is handled by the service worker's payload `tag`, avoiding provider Topic-length/format failures.
- Anonymous device subscriptions; no account system required.
- 30-minute alert cooldowns, stale-data labels, last-known-state fallback, notification testing, and diagnostics.
- A rolling ParkPulse live-sample history for today's observed low/high.
- Authenticated ThemeParks.wiki 30-day history backfill converted into 15-minute time-of-day baselines.
- Ride trend insights: typical wait now, usual range, today's observed range, and better/busier-than-typical labels.
- **Best now** sorts operating rides by current wait relative to their historical baseline once a baseline is available.
- **Live crowd levels** estimate park pressure on a 1–10 scale from the median of fresh, operating ride waits normalized against their time-of-day baselines. ParkPulse requires a minimum number of mature ride baselines before publishing a score and pauses the estimate during an active ticketed event.
- **Android PWA support** includes platform-aware install messaging, WebAPK-friendly manifest metadata, a maskable 512px icon declaration, unrestricted orientation, standalone launch behavior, and Android-safe notification presentation.
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
                  ├─ crowd pressure model (1–10)
                  ├─ stale-state handling
                  └─ push alert evaluation
                  │
                  ▼
              ParkPulse PWA
```

The Worker polls live data on the existing five-minute schedule. D1 writes are grouped through JSON-expanded batch operations to keep database round-trips small.

## Deploying v1.4.0

The frontend publishes through GitHub Pages. v1.4.0 does not add a new D1 migration; deploy the latest Worker after pulling the frontend release:

```bash
cd /workspaces/park-pulse-web
git pull origin main

cd worker
npm install
npm run deploy
```

The ThemeParks API key secret already configured in Cloudflare persists through ordinary Worker deployments.

After deployment:

```bash
curl -s https://parkpulse-api.jamesp5297.workers.dev/health | python -m json.tool

curl -s https://parkpulse-api.jamesp5297.workers.dev/api/analytics/status | python -m json.tool
```

Existing subscriptions, VAPID keys, ride-state data, and saved watches remain in place.


## Crowd level model

ParkPulse does not claim to know park attendance. The crowd level is a derived wait-pressure estimate:

- only fresh, operating attractions with numeric standby waits count
- each attraction must have a mature time-of-day baseline
- current wait is divided by that attraction's typical wait for the current 15-minute slot
- ratios are clipped to reduce outlier impact
- the park score uses the median normalized ratio, not a simple average
- Magic Kingdom requires at least 6 qualifying rides; smaller curated parks require at least 4
- if coverage is insufficient, the UI says the estimate is still building
- while a same-day ticketed event is actively running, the normal-day crowd estimate is paused

The 1–10 labels are:
- 1–2 Very Light
- 3–4 Light
- 5–6 Moderate
- 7–8 Busy
- 9 Very Busy
- 10 Extremely Busy

## Android

ParkPulse remains one PWA codebase for iOS, Android, and desktop. On Android, Chromium-based browsers can install it as an app-like PWA/WebAPK when installation criteria are met. The Settings install row automatically uses Android-specific guidance, while iPhone keeps its Add to Home Screen guidance.
