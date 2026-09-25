# ParkPulse Preview

This branch is the protected test bed for ParkPulse features before they move to `main`.

## Branch

`preview/seasonal-overlays`

Preview version: `1.9.0-preview.3`

Production `main` remains unchanged until the preview work is explicitly approved.

## Current preview experiment

This build ports four native-app ideas into the PWA without bringing back the old full planner:

- **Next Up** — one recommended ride at a time, with “I’m heading there” and “Show another.”
- **Recommendation explanations** — concise, factual reasons based on must-dos, favorites, live waits, and the existing historical comparison.
- **Park Day Lite** — a lightweight session that tracks the current Next Up ride, rides marked ridden, remaining must-dos, and watched rides.
- **Quick Actions** — Favorite, Must-do, Watch/Edit Watch, Set as Next Up, mark a completed ride back as not ridden, and Share.

No new backend schema or Worker logic is required for these features. Park Day Lite is intentionally device-local.

## Intended preview hostname

`preview.useparkpulse.com`

The preview build routes API and push requests through the preview Worker, which service-binds to the production ParkPulse API. This keeps the preview origin working without putting API secrets in the client.

## Test checklist

### Next Up
- Confirm a fresh, open ride is selected.
- Confirm **Show another** cycles without starting Park Day.
- Confirm **I’m heading there** starts Park Day Lite and locks that ride as Next Up.
- Confirm switching parks gives a recommendation for the selected park.
- Confirm stale, closed, source-missing, and already-ridden rides are not chosen as new recommendations.

### Recommendation explanations
- Confirm must-dos and favorites are called out correctly.
- Confirm “% below/better than typical” only appears when ParkPulse has an eligible baseline.
- Confirm the top Best Now / For me cards get compact explanation copy.
- Confirm ride sheets show the same factual ParkPulse context.

### Park Day Lite
- Confirm **Mark ridden** adds to the session count and advances Next Up.
- Confirm remaining must-dos update.
- Confirm watched count reflects watches in the selected park.
- Confirm **End Park Day** clears session-only progress without deleting favorites, must-dos, or watches.
- Confirm the session expires at ParkPulse’s 3 a.m. Eastern park-day boundary.

### Quick Actions
- Test Favorite / Remove favorite.
- Test Must-do / Remove must-do.
- Test Watch / Edit watch.
- Test Set as Next Up both before and during Park Day.
- Test Mark not ridden on a completed ride.
- Test Share.
- Test Escape/backdrop close and focus return on desktop.

### General regression
- iPhone installed PWA and Safari.
- Android/browser if available.
- Desktop.
- Frosted and Liquid.
- Light and dark mode.
- Pull to refresh and pull-down ride-sheet dismissal.
- Existing watches and Web Push.
- Deep links.
- Service-worker update banner.

## Preview deployment files

- `wrangler.jsonc` — preview Worker + static assets
- `preview-worker.js` — proxies API paths through the `PARKPULSE_API` Cloudflare Service Binding
- `assets/js/config.js` — uses the preview origin as `WORKER_BASE`

The production branch does not need these preview-only routing files. The preview badge intentionally says **Feature Preview** rather than naming a seasonal test.
