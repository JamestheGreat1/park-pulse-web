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


## D1 read optimization

Worker 1.7.3 adds a tiny `worker_state` table for alert-engine and history-sampler health. Status endpoints now read one metadata row instead of scanning the 31-day `ride_history` table. Ride insights also skip the raw 30-day history query whenever a ready baseline already exists.

The Worker creates `worker_state` automatically on scheduled/manual refresh, and `schema.sql` includes it for fresh deployments. Deploy the Worker after pulling this change.


### Ticketed-event handoff (Worker 1.7.4)

ParkPulse now treats fresh attraction-level `OPERATING` records as live even when the park's regular operating window has ended before a same-day ticketed event. The Worker recognizes the transition window and the active ticketed event from ThemeParks.wiki schedule data, keeps the attraction waits/statuses live, and withholds normal-day baselines/crowd comparisons during those special-event periods.

No D1 migration is required. Pull the latest repo and deploy from `worker/` with `npm ci && npx wrangler deploy`. After deployment, `/health` should report Worker `1.7.4`.

### Durable ride-alert retries (Worker 1.7.5)

Reopening and wait-threshold transitions are now saved into `pending_ride_alerts` in D1 **before** the notification checkpoint moves. A temporary Web Push error stays queued and is retried on later five-minute runs, up to a 20-minute freshness window. The Worker will not retry an obsolete wait target, expired/removed watch, closed ride, or invalid 404/410 subscription.

The queue sends at most six pending notifications per scheduled run, uses a two-minute claim lease to avoid duplicate sends during overlapping cron invocations, and expires old jobs during hourly maintenance. Delivery is **at-least-once**, not exactly-once: if a push provider accepts a message and D1 fails before recording success, a duplicate may still be possible. This trade-off prevents dropped alerts without pretending external Web Push supports transactions.

No destructive D1 migration or new Worker secrets are required. The Worker creates the table automatically; `schema.sql` includes the same additive table definition for fresh installs. Deploy after pulling this change:

```bash
cd worker
npm ci
npx wrangler deploy
```

Confirm the deployed Worker is `1.7.5`. The `/health` JSON includes `notificationEngine.delivery` with the previous run's `queued`, `delivered`, `retried`, `failed`, `discarded`, and `pending` counts. `pending` is a snapshot from that run, not a continuously updated queue length. A successful `/subscriptions/test` is useful for checking a device but does not exercise the transition queue.

For troubleshooting, inspect `npx wrangler tail --format pretty` after the next scheduled alert run. Keep the existing five-minute and hourly cron triggers enabled.

## ParkPulse 2.0 staging (development branch only)

**Do not run the production `npm run deploy` or plain `npx wrangler deploy` while working on the DLR staging build.** Phase 5 generates an entirely separate Worker source/configuration under `.parkpulse-staging/` at the repository root. The committed `assets/js/catalog.js` keeps Disneyland disabled; **only a generated copy is enabled**. The staging Worker is named `parkpulse-api-staging` and must use a different D1 database called `parkpulse-staging`.

From the repo root, while on `feature/multi-resort-dlr`, authenticate Wrangler as needed:

```bash
cd worker
npm install
npx wrangler whoami
npx wrangler d1 create parkpulse-staging
cd ..
```

Copy the returned D1 **database UUID** (not the production UUID). Generate staging artifacts with:

```bash
node worker/scripts/build-staging.mjs --database-id YOUR_NEW_STAGING_D1_UUID
cd .parkpulse-staging/worker
npm install --no-save --package-lock=false
npx wrangler deploy --config ./wrangler.toml --dry-run
```

The generator rejects the production database UUID, a malformed UUID, a non-staging worker name, and cron triggers. Before a live **staging-only** deploy, create the staging database schema (this does **not** touch production):

```bash
npx wrangler d1 execute parkpulse-staging --remote --file=./schema.sql --config ./wrangler.toml
npx wrangler deploy --config ./wrangler.toml
```

The deployment prints the staging URL, typically `https://parkpulse-api-staging.<your-subdomain>.workers.dev`. In a terminal, check `/health`, `/api/park/16`, and `/api/park/17`. Expect `staging: true` in health, six usable parks, and `pushRegistrationEnabled: false`. The initial deploy has **no scheduled triggers**, no private VAPID credentials, no connection to the live PWA, and no production D1 data. It only supports read-only live-ride API checks until you deliberately configure a staging-specific manual refresh token. Never copy production subscriptions.

Only once API testing passes should we enable manual data writes, staging test notifications, hourly history backfill, or scheduled sampling. Those require a separate explicit step and Cloudflare CPU/D1 measurements. The current staging `APP_URL` points at the reserved invalid domain on purpose so no push link can send users to production.

See `docs/parkpulse-2-staging-readiness.md` for the validation gates and expected D1 usage.

## Optional history-only staging cron (after inspecting staging CPU)

From the repository root, regenerate the staging copy with a history-only schedule:

```bash
git pull --ff-only
node worker/scripts/build-staging.mjs --database-id YOUR_STAGING_UUID --enable-history-cron
cd .parkpulse-staging/worker
npx wrangler deploy --config ./wrangler.toml --dry-run
npx wrangler deploy --config ./wrangler.toml
```

The `--enable-history-cron` switch changes the staging Worker only when redeployed: it attaches one five-minute cron. It records live state/history, **never** evaluates notification rules, sends push, advances alert checkpoints or initiates historical baseline backfill. The live production Worker and its cron behavior remain unchanged.

Verify `/health` includes `stagingHistoryOnly: true` and review scheduled invocations, CPU, errors and D1 usage. The scheduler continues after Codespaces is closed.

To disable recurring collection, regenerate without the switch and deploy the staging copy:

```bash
cd /workspaces/park-pulse-web
node worker/scripts/build-staging.mjs --database-id YOUR_STAGING_UUID
cd .parkpulse-staging/worker
npx wrangler deploy --config ./wrangler.toml
```

Existing staging D1 history is retained. Do not use the production deploy command.

**Rollback safety:** the staging default explicitly declares `[triggers] crons = []`, so redeploying the default staging build clears any previously attached staging cron rather than merely relying on a missing triggers section.

## ParkPulse 2.0 — Staging frontend preview and safer baseline batches

After the historical sampler is running and its D1 database is confirmed, generate the **staging app and Worker together**, without editing any production files:

```bash
cd /workspaces/park-pulse-web
git pull --ff-only
node worker/scripts/build-staging.mjs --database-id 937420cb-3ce0-49e5-9cca-5d7529f191b8 --enable-history-cron --preview-url https://parkpulse-api-staging.jamesp5297.workers.dev
cd .parkpulse-staging/worker
npx wrangler deploy --config ./wrangler.toml --dry-run
npx wrangler deploy --config ./wrangler.toml
```

This serves the staging PWA at `https://parkpulse-api-staging.jamesp5297.workers.dev/`, sharing an origin with the staging API. The entire frontend is copied and **DLR is enabled only in the ignored staging copy**. A unique preview version avoids service-worker cache collisions; the preview banner says alerts are disabled. The production PWA and Worker remain unchanged.

Do not use this public preview for sensitive information: the workers.dev URL is accessible to people with the link. Do not assume it requires authentication.

### Staging-only baseline backfill (no live polling)

The protected `POST /api/admin/baselines` route processes **up to four historical baselines per invocation** from the staging database's saved ride/source records. It avoids repeatedly fetching six parks, and it never evaluates notifications or advances alert checkpoints. It is unavailable on the production Worker. Only source records written in the last 20 minutes are eligible; if collection is unhealthy, fix the sampler first.

Use the existing staging token; keep it out of logs and messages. From `.parkpulse-staging/worker`:

```bash
curl -fsS --max-time 90 -X POST -H "Authorization: Bearer $(cat ../refresh-token)" https://parkpulse-api-staging.jamesp5297.workers.dev/api/admin/baselines | jq '{ok,eligibleRides,baseline,analytics}'
```

If `failed` is nonzero or the service returns HTTP 429/5xx, stop and inspect before retrying. Repeated calls are optional and should be rate-limited; 4 per call is a deliberate safety limit. Baselines can be incomplete for rides lacking enough 30-day history, so never force a "ready" status.


### Finish staging historical baselines with one command

Once a four-ride manual batch has worked (zero failures), there is a **manually started** backfill runner. It only calls the existing protected staging endpoint, never deploys or changes production, and never prints the private token. From any Codespaces terminal:

```bash
cd /workspaces/park-pulse-web && git pull --ff-only && node worker/scripts/backfill-staging.mjs
```

The runner checks staging Worker identity, separate D1 database, the currently enabled history-only cron and an active history collector. It processes **at most 26 batches**, each of **up to four attractions**, with a **40-second cooldown** between batches. It prints saved baseline progress, and stops on errors, history rate limits, missing source records, stalled progress or invalid responses. Press **Ctrl+C** to stop; successful batches remain saved in D1. Re-run later only after resolving any reported issue.

This is an interactive Codespaces process; keep the terminal session open until it finishes. It does **not** schedule or run unattended in Cloudflare.

To validate the local staging config without reading the token or making network requests:

```bash
node worker/scripts/backfill-staging.mjs --check
```

Even if the runner finishes, readiness may require checking enough valid historical days per attraction; review `/api/analytics/status` and real ride analytics before launch.

### Staging history IDs while Queue-Times supplies live waits

The staging-only baseline endpoint now resolves ThemeParks attraction UUIDs from the official park `/children` directory rather than the chosen live source. The curated catalog matches names to identifiers, and a 24-hour D1 `worker_state` cache avoids repeated directory lookups. This never changes the Queue-Times live fallback, changes no production configuration, and rejects constructing history requests from Queue-Times IDs. The protected endpoint reports `mappedRides` and `unmappedRides` for diagnosis.

After redeploying the staging Worker with `--enable-history-cron` and `--preview-url`, run one manual baseline batch and inspect the mapping counts and zero failures before restarting the paced backfill runner.

### Staging-only push delivery (manual device tests, no live ride notifications)

The ordinary staging build keeps push disabled. For an opt-in, isolated iOS/desktop Web Push smoke test, add `--enable-test-push` to the **staging generator**, alongside the existing `--enable-history-cron --preview-url` flags. It only changes the ignored `.parkpulse-staging` copy: `STAGING_ALLOW_PUSH = "true"`, `STAGING_PUSH_TEST_ONLY = "true"`. It leaves automatic alert jobs disabled. Production remains unchanged.

From Codespaces, on `feature/multi-resort-dlr`:

```bash
cd /workspaces/park-pulse-web && git pull --ff-only
node worker/scripts/build-staging.mjs --database-id 937420cb-3ce0-49e5-9cca-5d7529f191b8 --enable-history-cron --preview-url https://parkpulse-api-staging.jamesp5297.workers.dev --enable-test-push
node worker/scripts/setup-staging-push.mjs --check
node worker/scripts/setup-staging-push.mjs
cd .parkpulse-staging/worker && npx wrangler deploy --config ./wrangler.toml
```

The setup utility creates a **new P-256 VAPID keypair** in gitignored `.parkpulse-staging/push-vapid.json` (private permissions) and uploads two staging Worker secrets through Wrangler. **No key is printed.** Re-running setup reuses the same local keys, which is important to keep existing staging push subscriptions. It refuses to run unless Worker name, isolated staging D1, staging app origin and both staging push/cron flags are correct. Keep `.parkpulse-staging` out of Git and never copy the production VAPID values.

Verify `GET /health` reports `staging: true`, `pushRegistrationEnabled: true`, `stagingPushTestOnly: true`, `vapidConfigured: true` and `stagingHistoryOnly: true`.

**iPhone:** open the staging URL in Safari, Share → Add to Home Screen, then launch the new staging Home Screen icon (this is separate from production). Under Settings, enable notifications. Once the watch syncs, tap **Send test**. If allowed by iOS, the phone should receive a `ParkPulse test` notification. The Worker only sends a test to a **registered staging D1 subscriber** and allows at most one test per minute. Do not send test notifications to third-party subscriptions.

**Important:** This phase only verifies permission, VAPID, isolated subscription registration and push delivery. The staging schedule continues sampling history only, and **does not automatically send live wait/reopening alerts**. Validate the real alert pipeline separately before production rollout. The staging Worker URL is not a private authentication boundary.
