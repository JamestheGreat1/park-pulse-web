# ParkPulse Preview

This branch is the protected test bed for ParkPulse features before they move to `main`.

## Branch

`preview/seasonal-overlays`

Preview version: `1.9.0-preview.10`

Production `main` remains unchanged until the preview work is explicitly approved.

## Current preview experiment

This build intentionally keeps the PWA small. After testing a broader native-app port, Park Day Lite and Quick Actions were removed from the PWA preview and remain native-app ideas.

The preview now tests only:

- **Next Up** — one useful ride recommendation at a time, with **View ride** and **Show another**.
- **Recommendation explanations** — short, factual context based on must-dos, favorites, live waits, and the existing historical comparison.

Ride cards stay simple: **Favorite + Alert** only.

No new backend schema or Worker logic is required for these features.

## Preview URL

`https://preview-seasonal-overlays-park-pulse-web.jamesp5297.workers.dev/`

The preview Worker routes API, health, and push requests through the `PARKPULSE_API` Cloudflare Service Binding. API routes are network-only in the preview service worker so live wait responses are not served from the static shell cache.

## Test checklist

### Next Up
- Confirm an open, fresh ride is recommended when one is available.
- Confirm **View ride** opens the normal ride sheet.
- Confirm **Show another** cycles through eligible recommendations.
- Confirm switching parks recalculates the recommendation.
- Confirm stale, closed, and source-missing rides are not recommended.
- Confirm the card stays out of the way when there is no eligible recommendation.

### Recommendation explanations
- Confirm must-dos and favorites are called out correctly.
- Confirm “% below/better than typical” only appears when ParkPulse has an eligible baseline.
- Confirm the top Best Now / For me cards get compact explanation copy.
- Confirm ride sheets show the same factual ParkPulse context.

### Ride-card simplicity
- Confirm each ride card has only **Favorite** and **Alert** controls.
- Confirm there is no Quick Actions menu.
- Confirm there is no Park Day screen, Park Day state, or Park Day shortcut.

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

The production branch does not need these preview-only routing files. The preview badge intentionally says **Feature Preview**.

## Cloudflare Preview binding note

Worker Previews do not inherit top-level bindings. Preview-specific service bindings must also be declared inside `previews.services`. The `PARKPULSE_API` binding is therefore listed both at the top level and under `previews`.
