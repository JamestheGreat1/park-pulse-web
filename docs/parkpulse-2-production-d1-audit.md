# ParkPulse 2.0 — production D1 readiness audit

**State: read-only audit prepared. No production rollout, SQL migration, restore, or data export performed by this document.**

## Repository comparison (2026-10-31)

Compared `main` with `release/2.0.0-rc1`:

- `worker/schema.sql` is byte-identical (11 application tables).
- `worker/wrangler.toml` is byte-identical: Worker `parkpulse-api`, DB binding `parkpulse`, application origin and five-minute/hourly schedules unchanged.
- Release candidate modifies Worker implementation, including multi-resort data and opt-in staging-only notification verification, **but does not introduce a declared D1 schema migration**.
- Identical checked-in SQL is not evidence that the deployed production D1 has every table or compatible columns. Confirm remotely.
- Production and staging have independent D1 UUIDs. **Never import staged history or subscriptions into production.** California production baselines will begin without the staged historical data.

## Read-only production checks — commands for Codespaces

These run with production Wrangler config but **do not deploy or write D1 data**. Do not copy raw Push endpoint / subscription key rows into ChatGPT or a public issue.

```bash
cd /workspaces/park-pulse-web
git fetch origin
git switch release/2.0.0-rc1
git pull --ff-only
cd worker

# Check that you are querying the existing production DB and new Time Travel storage.
npx wrangler d1 info parkpulse

# Record the pre-release Time Travel bookmark in private release notes.
# Do NOT run 'time-travel restore': it overwrites production data.
npx wrangler d1 time-travel info parkpulse

# Report only table names, never private subscription data.
npx wrangler d1 execute parkpulse --remote --config ./wrangler.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"

# Report only row counts. If any table is missing, stop and review first.
npx wrangler d1 execute parkpulse --remote --config ./wrangler.toml \
  --command "SELECT 'subscriptions' AS category, COUNT(*) AS rows FROM subscriptions UNION ALL SELECT 'history', COUNT(*) FROM ride_history UNION ALL SELECT 'baselines', COUNT(*) FROM ride_baseline UNION ALL SELECT 'notification_checkpoint', COUNT(*) FROM notification_ride_state UNION ALL SELECT 'pending_alerts', COUNT(*) FROM pending_ride_alerts;"

# Schema information is safe to inspect without exposing Push credentials.
npx wrangler d1 execute parkpulse --remote --config ./wrangler.toml \
  --command "PRAGMA table_info(subscriptions);"
npx wrangler d1 execute parkpulse --remote --config ./wrangler.toml \
  --command "PRAGMA table_info(notification_ride_state);"
npx wrangler d1 execute parkpulse --remote --config ./wrangler.toml \
  --command "PRAGMA table_info(pending_ride_alerts);"
```

### Expected schema

Tables defined in `worker/schema.sql`: `subscriptions`, `ride_state` (legacy, retained), `ride_state_v2`, `notification_log` (legacy, retained), `notification_log_v2`, `ride_history`, `ride_baseline`, `ride_baseline_meta`, `notification_ride_state`, `worker_state`, and `pending_ride_alerts`.

- `subscriptions`: `endpoint`, `p256dh`, `auth`, `watch_ids`, `updated_at`. These contain real push credentials. **Never print or paste row data.**
- `notification_ride_state`: `ride_key`, `park_id`, `source_id`, `name`, `land`, `is_open`, `wait_time`, `source`, `source_updated_at`, `updated_at`.
- `pending_ride_alerts`: `endpoint`, `ride_key`, `kind`, `payload`, `threshold`, `created_at`, `expires_at`, `attempts`, `next_attempt_at`, `lease_until`.
- Production may contain *additional* operational or legacy tables. Do not delete them.
- Production may have fewer or missing columns due to older deployments even if checked-in SQL is unchanged. Stop and plan additive fixes on a separate release-review commit; don't run schema scripts blindly.

## Release-day backup and recovery

1. Validate `wrangler d1 info parkpulse` reports a modern production D1 storage version with Time Travel support. Cloudflare Time Travel records point-in-time bookmarks automatically; record the bookmark immediately before deploying.
2. For an independent, portable copy before publishing, use Cloudflare's supported remote SQL export **only after choosing a safe release window**:

   ```bash
   cd /workspaces/park-pulse-web/worker
   umask 077
   npx wrangler d1 export parkpulse --remote --config ./wrangler.toml --output="$HOME/parkpulse-private-pre-2.0.sql"
   ```

   This file contains subscription endpoints, key material, and live service data. Treat it as **highly sensitive**, keep it outside the Git checkout and out of screenshots, and store it securely outside any shared repo. Verify file size and that the SQL contains schema/data. Exports can temporarily affect D1 query availability.
3. **Never use** `d1 time-travel restore` as an automatic rollback for a failed PWA/Worker deploy. It overwrites the current DB in place and would discard new watches/history after the restore point. Roll back the Worker and PWA first; evaluate any database repair separately.
4. Confirm that existing installed watches and historic WDW wait samples remain present after deployment. Only then enable public DLR, keeping staged users/keys isolated.

Reference: [Cloudflare Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) and [D1 SQL export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Release gate

- [x] Compared checked-in production schema and Wrangler config against the RC.
- [x] Read-only inspection of actual remote production tables and critical columns: 11 expected app tables (plus Cloudflare-managed `_cf_KV`), critical `subscriptions`, `notification_ride_state`, and `pending_ride_alerts` columns match the declared schema (user screenshots on 2026-10-31).
- [x] Confirmed production Time Travel returns a current bookmark on Wrangler 4.136.3. **A fresh predeployment bookmark should still be saved privately at release time.**
- [x] Read-only counts verified on 2026-10-31: 8 subscriptions, 419,662 history samples, 2,924 baseline rows, 47 notification ride checkpoints, 0 pending alerts. This is evidence of retained state, not a backup.
- [ ] Final private production SQL export for independent recovery (before rollout).
- [ ] Verified normal five-minute + hourly production Worker schedules, D1 costs and source freshness.
- [ ] Confirmed real *natural* wait/reopening push delivery on iPhone, beyond the synthetic queue test.
- [ ] Final stable 2.0.0 commit enables Disneyland, updates version and changes staging generator accordingly.
- [ ] Explicit release approval; then production Worker-first deployment, PWA publish and post-release monitoring.

**No production DB edits, deploys, merges or releases from this audit.**
