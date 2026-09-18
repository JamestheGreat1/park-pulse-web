# ParkPulse v0.15.2 — PWA Release

ParkPulse is a personal Walt Disney World park-day assistant built as an installable static Progressive Web App. The front end can live on GitHub Pages. An included Cloudflare Worker adds a same-origin-friendly Queue-Times proxy and real Web Push ride-reopen alerts.

## What is finished in 0.15.2

- Five stable tabs: **For You / Plan / Waits / Favorites / Settings**.
- Four-park Walt Disney World switching with Magic Kingdom as the initial park.
- Live Queue-Times waits with saved-data fallback, timeouts, refresh-on-return, and five-minute foreground refreshes.
- The cleaned-up itinerary flow: a fixed search header/footer, persistent selected count, one-tap selection, stable Favorites / Recommended / Browse sections, and no list resorting when an item is tapped.
- Non-linear tab jumps are direct and preserve each tab's scroll position.
- Custom itinerary blocks for meals, breaks, transit/park hops, and notes.
- Park Day mode with an in-app **Next Up** pill, Done, and Skip-for-now controls.
- Timing suggestions inspect the next few itinerary stops but never silently reorder the plan.
- Local wait-history intelligence adds context when a wait is unusually good compared with recent samples on this device.
- Favorites, priority levels, open-only/search filters, light/dark/system appearance, eight accent themes, daily progress rollover, and local reset.
- Installable Home Screen PWA with offline app shell.
- Web Push-ready service worker plus an included Cloudflare Worker/D1 backend that can notify when a watched favorite/itinerary ride reopens.
- Reduced-motion support, small-screen cleanup, accessible focus states, and restrained transitions that do not drive layout.

## Run locally

Serve the folder over HTTP. Service workers do not run from `file://` URLs.

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

The package is intentionally build-free. Upload the contents of this folder to the root of the Pages repository and enable GitHub Pages for the branch. `.nojekyll` is already included.

## Real push notifications

The front end works without the Worker, but the **Enable Notifications** button remains disabled until a Worker URL is configured. See `worker/README.md`, deploy it, then set `WORKER_BASE` in `assets/js/config.js`.

## Data source

ParkPulse uses the free Queue-Times Real Time API and keeps the required prominent **Powered by Queue-Times.com** attribution in the app.
