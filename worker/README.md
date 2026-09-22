# ParkPulse Worker

The Worker is the always-on part of ParkPulse. It proxies Queue-Times for the PWA, stores Web Push subscriptions in D1, and polls the four Walt Disney World parks every five minutes.

Each device stores alert rules in the existing `subscriptions.watch_ids` JSON field, so the v1 rebuild does **not** require a destructive D1 migration. Rules may watch for a ride reopening, a posted wait crossing below a target, or both, with an optional expiration time.

## Deploy

From `worker/`:

```bash
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql
npm run deploy
```

The existing `parkpulse` D1 database and VAPID secrets can be reused. `wrangler.toml` keeps the current database ID and public VAPID key. The private VAPID key remains a Worker secret.

Queue-Times updates its public real-time data about every five minutes, which matches the Worker cron cadence.
