# ParkPulse 2.0.0 — release candidate go/no-go

**Status: HOLD / release candidate only.** This file does not authorize production deployment.

- Candidate branch: `release/2.0.0-rc1` (based on `feature/multi-resort-dlr`).
- Candidate version: `2.0.0-rc.1`; live production remains on its existing version.
- The committed `assets/js/catalog.js` deliberately keeps the Disneyland Resort, Disneyland Park, and Disney California Adventure **disabled**. A staging-only generator enables them in a gitignored copy; never reuse that generated config or its D1/secrets for production.
- Production Worker (`parkpulse-api`), database (`parkpulse`), and `app.useparkpulse.com` must not be changed just to review this candidate.

## Evidence already collected

- Curated catalog: 47 WDW rides + 35 Disneyland Park + 19 Disney California Adventure = 101 stable attraction keys. Source coverage validated in staging.
- User-reported staging: 101 populated historical baselines, 100/100 earlier regression tests, controlled Web Push and one-shot scheduled D1 queue/checkpoint simulation delivered.
- Cloudflare screenshot (2026-10-31, 24-hour range): staging Worker 230 invocations, zero Worker errors, roughly 9 ms CPU metric, about 165k D1 rows read and 64k written, 1.5 MB storage. These are aggregate dashboard figures, **not guaranteed upper bounds** on a scheduled invocation.
- Billing screenshot: Workers Paid allowances (50 million D1 writes, 25 billion reads, 30 million CPU milliseconds included per month); current usage 312.85k writes, 315.12k reads and 11.17k Worker CPU milliseconds. Production and staging can share monthly account allowances.
- Screenshot of staging `/health` has `stagingHistoryOnly: true`, `stagingPushTestOnly: true`, `stagingCronProbeAvailable: true`; `notificationEngine.ready: false` / `waiting` is expected in history-only mode.
- These observations demonstrate staging readiness **only**; the production alert scheduler, production D1 migration state, and full sustained load have not been proven by them.

## Mandatory gates before final 2.0.0

- [ ] GitHub Actions for the candidate's draft PR: regression, browser/offline, Worker bundle, staged-preview smoke all pass. Treat the read-only upstream source audit as advisory; manually resolve real source failures.
- [ ] Confirm at least one **natural, real live wait-target transition** and one **natural reopening** through the scheduler/alert queue, with correct same-device delivery, no duplicates, and no cross-resort misrouting. The synthetic staging probe **does not** satisfy this gate. Design a controlled, isolated staging integration test; do not enable real alerts for arbitrary staging subscribers without review.
- [ ] Verify a recent staging history-only run actually writes correct live samples at the six parks, and check scheduled CPU *distribution*, exceptions, source freshness, hourly work, D1 consumption, and a few 5-minute cycles after quiet periods.
- [x] Checked-in production schema/Worker configuration match `main` (no new declared D1 migration). The user also confirmed actual production tables and critical columns via read-only Wrangler queries, with existing subscriptions/history/checkpoints intact and Time Travel bookmark available. **Private SQL export remains pending.** See [production D1 audit](parkpulse-2-production-d1-audit.md).
- [ ] Recheck monthly account-wide D1, Worker and subrequest headroom with both staging and production running; staging numbers alone do not include full live-alert costs. Decide when to reduce/stop staging after launch.
- [ ] Run acceptance on iPhone standalone PWA and desktop: both resorts, all six park selectors, remembered resorts, history, local vs. park time/DST, shared links, favorites/watches, offline cache, light/dark and Liquid/Frosted Glass.
- [ ] Produce final release commit (not this RC): switch exactly three catalog `enabled: false` flags for DLR/DL/DCA to `true`, change candidate version/cache to `2.0.0`, update the staging generator/tests to accept a now-public DLR catalog safely, and prepare a stable changelog/README. Validate that zero staging Worker names, test origins, private VAPID settings, or staging D1 IDs reach the production config.
- [ ] Obtain explicit signoff before merge and production rollout.

## Future release sequence — only AFTER all gates pass

1. Freeze release commit and keep its GitHub SHA, the pre-release production SHA, an export of production D1, and exact production Worker deployment configuration. Confirm backups are readable; preserve production push secrets.
2. Run a fresh CI suite and bundle dry-run on the final candidate. Apply only reviewed additive schema changes to production D1, if needed; do not import staging data or subscriptions.
3. Deploy production Worker **first** with its existing D1 binding, production origins, real VAPID keys, and normal five-minute/hourly crons. Verify `/health`, existing WDW waits/watches and scheduled work before publishing the frontend.
4. Publish the PWA as `2.0.0` with matching cache/import/version keys, then verify upgrade from an existing installed 1.9.5 PWA and both resorts.
5. Monitor errors, CPU spikes, subrequests, D1 reads/writes and both real resort alert pipelines during the first several scheduled runs and hourly maintenance; check data quality after the Pacific and Eastern park-day boundaries.
6. If frontend fails, restore the previous site and cache/version assets; if Worker fails, roll back to the saved prior Worker deployment. Database rollback is **not** an automatic destructive restore after new user writes; investigate and reconcile additive changes to preserve subscriptions/history.

## Known expected behavior and risks

- Staging's 101 baselines do **not** automatically populate production D1. California's production comparisons may initially show honest insufficient-data states while history warms; do not manufacture historical trends.
- Staging presently runs in history-only mode; its notification-engine `waiting` status is not the same as a broken production engine.
- `worker/scripts/build-staging.mjs` currently requires the three committed DLR source flags to remain disabled. It must be adjusted deliberately at the final enablement step, together with tests.
- This release adds **no** trip planner, user accounts, or new paid features. Keep the existing four-tab UI and the low-noise ParkPulse design.

**Release rule:** no merge to `main`, production D1 write, production Worker deploy or public PWA publish until the above gates are explicitly accepted.
