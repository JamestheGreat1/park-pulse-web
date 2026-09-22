# Changelog

## 1.0.0 — 2026-09-22

ParkPulse was rebuilt around one job: watch rides for you.

- Removed itinerary planning, recommendations, priorities, Park Day mode, and the old five-tab information architecture.
- Added focused Explore / Watching / Settings navigation.
- Added Liquid Glass ride cards, sheets, controls, and responsive navigation.
- Added per-ride reopening alerts, wait targets, and automatic watch expiration.
- Reused the existing Cloudflare Worker, D1 database, VAPID identity, GitHub Pages URL, and PWA install identity.
- Upgraded the Worker to understand rich alert rules while remaining compatible with legacy numeric watch IDs.
