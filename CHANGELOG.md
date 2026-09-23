# Changelog

## 1.5.5 — 2026-09-23

- Fixed the bogus `↓ 100% vs typical` badge when a ride did not actually have a historical baseline.
- Best Now and crowd estimates now use the same baseline eligibility rules.
- Added live history-collection diagnostics so Settings shows whether five-minute ride samples are still arriving.
- Added baseline/backfill health details and a deploy-time check for the ThemeParks API key.
- Removed the obsolete admin-wide push test endpoint and its unused `PUSH_ADMIN_TOKEN`; device test notifications still use the normal subscription-specific endpoint.
- Shortened ride-watch notifications and added compact ride names so alerts are easier to scan in Notification Center.


## 1.0.0 — 2026-09-22

ParkPulse was rebuilt around one job: watch rides for you.

- Removed itinerary planning, recommendations, priorities, Park Day mode, and the old five-tab information architecture.
- Added focused Explore / Watching / Settings navigation.
- Added Liquid Glass ride cards, sheets, controls, and responsive navigation.
- Added per-ride reopening alerts, wait targets, and automatic watch expiration.
- Reused the existing Cloudflare Worker, D1 database, VAPID identity, GitHub Pages URL, and PWA install identity.
- Upgraded the Worker to understand rich alert rules while remaining compatible with legacy numeric watch IDs.
