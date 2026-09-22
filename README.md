# ParkPulse v1.0 — Ride Watcher

ParkPulse is an installable PWA that watches Walt Disney World ride statuses and posted wait times so you do not have to keep refreshing a park app all day.

## What v1 does

- Live Queue-Times data for Magic Kingdom, EPCOT, Hollywood Studios, and Animal Kingdom.
- Liquid Glass-inspired responsive UI for iPhone, Android, and desktop.
- Per-ride alerts for **reopening** and **wait at/below a chosen target**.
- Watch durations: today, three hours, or until disabled.
- Web Push through the existing Cloudflare Worker + D1 backend, including when the PWA is closed.
- Anonymous device subscriptions; no account system required.
- Installable/offline-capable PWA shell with light/dark/system appearance.
- Required prominent **Powered by Queue-Times.com** attribution.

Queue-Times publishes live ride status/wait data and updates it about every five minutes. ParkPulse is independent and is not affiliated with Disney.

## Deployment

The static site remains GitHub Pages-friendly and build-free. The current Worker origin is configured in `assets/js/config.js`.

After this rebuild, redeploy the Worker once so wait-threshold rules are understood by the backend:

```powershell
cd worker
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql
npm run deploy
```

Existing D1 data and VAPID keys are compatible. No database reset is needed.
