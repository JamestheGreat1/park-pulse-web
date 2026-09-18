# Changelog

## v0.15.2 — 2026-09-17

### Itinerary / Park Day
- Rebuilt attraction selection as a stable sheet: fixed search/header/footer, persistent selected count, and no selection-driven resorting.
- Added Favorites, Recommended, and Browse picker sections.
- Added custom meal, break, transit, and note blocks.
- Added direct non-linear tab switching with per-tab scroll restoration.
- Added Park Day mode, Next Up, Done, and Skip for now.
- Next Up may surface a stronger timing window from the next few stops, but it never mutates itinerary order.

### Intelligence
- Added lightweight local wait-history sampling.
- Recommendations now combine priority, favorites, current park median, recent ride median, wait length, plan presence, and ridden-today state.
- Added explicit recommendation reasons instead of opaque scores alone.

### Reliability / boring stuff
- Added request timeouts, cached wait fallback, reconnect refresh, visibility refresh, daily progress rollover, missing-ride resilience, and offline messaging.
- Kept transitions opacity/paint-focused so interactive state does not move the user's scroll position.
- Added reduced-motion behavior, small-screen spacing pass, keyboard focus states, and stable modal overflow.
- Added versioned service-worker cache cleanup.

### PWA / Push
- Added installable manifest and Home Screen icons.
- Added service worker for app-shell offline support and Web Push display/click handling.
- Added optional Cloudflare Worker + D1 backend with Queue-Times proxy, push-subscription storage, five-minute ride polling, reopen detection, stale-subscription cleanup, and a protected test endpoint.
