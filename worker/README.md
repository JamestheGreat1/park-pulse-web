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

The Worker now bootstraps the notification checkpoint tables automatically. `schema.sql` is still safe to run on a fresh deployment, but existing installs no longer depend on a manual migration for ride alerts. The first scheduled run seeds its checkpoint; alerts begin with subsequent transitions. Manual refresh never advances this checkpoint.

The existing `parkpulse` D1 database and VAPID secrets can be reused. `wrangler.toml` keeps the current database ID and public VAPID key. The private VAPID key remains a Worker secret. ParkPulse also requires a `THEMEPARKS_API_KEY` Worker secret for 30-day historical backfill; Wrangler now refuses production deploys if that secret is missing.

Set it once with:

```bash
npx wrangler secret put THEMEPARKS_API_KEY
```

The regular five-minute D1 ride-history sampler continues independently of the backfill key.

Queue-Times updates its public real-time data about every five minutes, which matches the Worker cron cadence.

## Manual refresh

ParkPulse exposes a protected manual refresh endpoint at `POST /api/admin/refresh`. It fetches current ride data, writes the current D1 snapshot, and advances one baseline/backfill batch without evaluating or sending ride notifications.

Create the required Worker secret before deploying:

```bash
npx wrangler secret put REFRESH_ADMIN_TOKEN
```

Send the secret as a bearer token:

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $PARKPULSE_REFRESH_TOKEN" \
  https://parkpulse-api.jamesp5297.workers.dev/api/admin/refresh | jq
```

The response includes the number of rides updated, primary/fallback source usage, baseline batch results, and the current analytics status.



### Shared ride history (1.7.0)

`GET /api/ride/:id/history?range=today|7d|30d` returns actual collected samples, including closed and unknown states. Today uses the park's Eastern day boundary. Responses use 5-, 15-, or 30-minute buckets, retain the last actual sample per bucket, and contain at most 1,441 points. These are not full-resolution min/max statistics. Existing `ride_history` data is reused; no new migration is required.

Deploy this Worker after updating the frontend: `cd worker && npm ci && npx wrangler deploy`. The 1.6.6 notification schema initialization and scheduler health endpoint remain included.


### CPU-limit recovery (Worker 1.7.2)

The five-minute job now only fetches rides, evaluates alerts, and records live history/checkpoints. Historical baseline rebuilds and retention cleanup run in a separate hourly invocation (`17 * * * *`), with at most two baseline rides per run. Manual refresh still advances its existing baseline batch. Timezone formatters are reused during history processing instead of rebuilt per sample.

Deploy using `npx wrangler deploy` from this folder; confirm both cron schedules in the deployment output. In `npx wrangler tail --format pretty`, look for `Alert job: complete` on successive five-minute runs. Stage logs identify the last completed stage if CPU exhaustion persists. They do not log subscription endpoints or credentials.

A CPU-limit outcome does not identify the expensive stage by itself. Workers Free has a 10 ms CPU budget per scheduled invocation; moving maintenance reduces work but cannot guarantee free-tier capacity for alert encryption and all source processing. If the alert job still exceeds CPU, check the Workers plan and configured CPU limit. This release does not change billing or impose a paid-only CPU setting.
