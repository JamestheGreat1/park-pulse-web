# ParkPulse 2.0 — Staging readiness and capacity gates

This document applies to the **development branch only**. Do not merge it into production as an instruction to enable DLR: the Disneyland Resort and both California parks are intentionally disabled in `assets/js/catalog.js`.

## Functional integration

- [x] Shared WDW/DLR metadata; each park has its own IANA timezone.
- [x] Stable Disneyland and California Adventure ride keys and curated ride lists.
- [x] Read-only verification: both providers match 35/35 Disneyland Park and 19/19 DCA curated rides.
- [x] Seasonal aliases deduplicate while separate ride queues remain distinct.
- [x] Fourth Resorts tab, remembered resort and per-resort park choice, WDW migration.
- [x] Cross-resort watched rides are fetched alongside the currently selected resort; other resort watches persist.
- [x] Shared links route to the correct park before the ride sheet opens, when the destination is enabled.
- [x] Pacific park-day boundaries for history, baselines, watch expiration and alert reopening checks.
- [x] Indexed subscriptions and bounded two-at-a-time park source fetches.
- [x] Automated Worker dry run, PWA offline/browser checks and controlled DLR browser integration fixture.
- [ ] Validate actual Cloudflare staging Worker CPU/D1 costs and live notification delivery.
- [ ] Make DLR enabled for **staging only**, assess unseeded histories and baseline warmup.
- [ ] Test and explicitly approve production release, then perform version/cache bump.

## D1 budget: why staging is a release gate

Current WDW catalog: 47 rides. Curated Disneyland + DCA: 54 more. Six-park total: **101 rides**.

The current five-minute Worker cron runs 288 times/day. If all 101 attractions are fresh, it can write approximately:

| Table | Potential base rows per day |
|---|---:|
| `ride_state_v2` current state | 101 × 288 = 29,088 |
| `notification_ride_state` alert checkpoint | 101 × 288 = 29,088 |
| `ride_history` five-minute samples | Up to 101 × 288 = 29,088 |
| **Total, excluding other writes** | **Up to 87,264** |

These are **estimates**, not observed Cloudflare usage. D1 index maintenance, queued alerts, worker state, baseline refresh and other database activity can materially increase usage. Scheduled jobs and on-demand refreshes may add writes as well. Before production, compare actual staging usage against the user's Cloudflare account plan and leave meaningful headroom. **Do not assume Free-tier capacity is sufficient.**

A source outage may reduce fresh samples; it is not a capacity strategy. Never silently weaken alerts or falsify live/unknown states to reduce writes. If headroom is insufficient, revisit checkpoint/history write strategy, indexes, or plan limits before enabling DLR.

## Safe staging procedure (no production database)

1. Create a separate Cloudflare D1 database and a distinct staging Worker/configuration. Do not reuse the `parkpulse` production D1 ID or production Worker name.
2. Configure staging-only secrets and origins through Wrangler. Use a staging test frontend, **not** the production PWA/service-worker scope. Never print secrets in CI or commit them.
3. Apply `worker/schema.sql` to the **staging D1 only**. Verify counts and that the new database contains no production subscriptions.
4. Enable California flags in a staging-only test copy; do not alter main or the production configuration.
5. Deploy the staging Worker from the staging configuration. Start with manual tests before enabling cron triggers.
6. Confirm both `/api/park/16` and `/api/park/17` responses and 404 behavior for unknown parks. Validate seasonal overlays, source freshness, and holiday operating hours.
7. Verify history `?range=today` and insights for both resorts, including after midnight in Eastern/Pacific zones and daylight-saving changes. Newly enabled rides should show honest not-ready states until historical data is built.
8. Subscribe a test browser to one WDW and one DLR ride. Verify distinct wait and reopen messages, cooldown, idempotent checkpoints, retry behavior and cross-resort deep links. No real production recipients.
9. Run staged five-minute checks while inspecting Worker tail CPU duration, exceptions, D1 rows written/read, quota headroom and polling time. Account for hourly baseline maintenance and retries.
10. Only after checks pass: prepare production rollback and database backups, backend-first release, frontend cache/version bump and a controlled feature enablement.

## User action boundary

No Worker deployment is required for Phases 1–4. **The user will need to deploy the staging Worker and later the production Worker from their authorized Cloudflare/Wrangler environment.** Provide exact commands only once the staging database ID, Worker config and account plan are known and verified. Never run default `wrangler deploy` against production during development.

## Staging artifact generator (prepared in Phase 5)

Run `node worker/scripts/build-staging.mjs --database-id UUID` at the repository root after `npx wrangler d1 create parkpulse-staging`. The generator copies Worker files and **enables DLR only in the generated catalog** inside ignored `.parkpulse-staging/`. It rejects a UUID equal to the production D1 binding, validates the distinct Worker/database names, and keeps cron triggers off. The script never contacts Cloudflare.

The generated configuration intentionally permits only GET/read endpoints and protected manual refresh initially. It blocks subscription routes and ignores accidental cron invocations; subscription tests require explicit staging switches and new VAPID keys. A placeholder `.invalid` URL ensures staging notification links cannot route to the live PWA.

Cloudflare documentation: `wrangler d1 create` returns the database binding ID, and `wrangler d1 execute ... --remote --file` applies SQL remotely. Deploying from `.parkpulse-staging/worker` must include `--config ./wrangler.toml` on every command; do not run the regular production deploy command for staging.

**Do not paste credentials or subscription endpoints into ChatGPT or GitHub.** For first live testing, send back only the staging Worker URL and redacted `/health` output.

## Controlled history-only staging mode

The staging generator can optionally use `--enable-history-cron` after manual CPU checks. This adds only one five-minute trigger on the generated staging Worker and activates its history-only guard. Notifications, alert checkpoints and historical backfill remain disabled. The default generator still produces no cron. See `worker/README.md` for enable/disable commands and metric checks.
