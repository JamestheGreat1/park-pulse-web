# Changelog

## 1.8.5 — 2026-09-25

- Fixed Liquid Glass ride sheets on iPhone/iPad so long ride cards scroll vertically instead of clipping the bottom controls.
- Preserved horizontal clipping for the glass effect while restoring normal touch scrolling inside the sheet.
- Added extra safe-area room below the final ride-watch action so controls clear the Home indicator.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.4 — 2026-09-25

- Added a lightweight **Next Up** card with **View ride** and **Show another** for a quick “what should I ride?” answer without turning ParkPulse into a planner.
- Added clearer factual recommendation context to **Best Now** results and ride sheets.
- Removed the overlapping **For Me** sort; **Favorites + Best Now** now covers the personalized shortlist cleanly, and old saved For Me state falls back to Best Now.
- Removed the separate **Must-do** toggle and legacy Must-do state; Next Up now uses favorites plus live wait/value context.
- Kept ride cards focused on just **Favorite** and **Alert** controls.
- Condensed Settings health information into four status rows with deeper technical details under **Show diagnostics**.
- Hardened dynamic button binding so Settings customization controls cannot be disabled by a diagnostics wiring error.
- Fixed desktop ride sheets so they stay vertically centered, expand to fit their full content, and never use the mobile scroll/swipe behavior.
- Grouped desktop wait-target − / value / + controls so adjustments no longer require moving across the whole sheet.
- Added regression coverage for the simplified UI and both release-blocker fixes.
- Frontend-only update; no Worker deployment required.

## 1.8.3 — 2026-09-25

- Made the selected park much easier to identify in both Frosted and Liquid Glass while keeping the glass look intact.
- Strengthened the selected park's accent tint, border, text weight, and subtle glow without dimming the other parks.
- Aligned frontend module/cache version keys so installed PWAs reliably receive the update.
- Frontend-only update; no Worker deployment required.


## 1.7.5 — 2026-09-24

- Rebuilt PWA wait-history charts with readable axes, grid lines, average reference, and Low / Average / High summaries.
- Simplified ride-history explanatory copy while preserving real gaps for closures and missing data.
- Right-aligned notification/settings actions consistently on mobile.
- Added native-feeling pull-down dismissal for ride sheets when the sheet is already scrolled to the top.
- Frontend-only update; no Worker deployment required.


## 1.7.4 — 2026-09-24

- Connect continuous wait-history samples with a subtle line while keeping closures, unknown waits, and missing stretches as real gaps.
- Updated chart accessibility/copy to match the new connected-history behavior.
- Frontend-only update; no Worker deployment required.


## Worker 1.7.2 — 2026-09-24

- Separated hourly baseline/retention maintenance from five-minute alert checks.
- Reused timezone formatters and calculated park opening state once per park.
- Added safe stage logs for diagnosing CPU-limit failures.
- Requires Worker redeployment; PWA stays at 1.7.1. Production CPU recovery must be verified in tail logs.


## 1.7.1 — 2026-09-24

- Polished ride-card actions with equal favorite/watch sections, a continuous sidebar outline, and a visible divider.
- Matched icon sizing, active backgrounds, and inset keyboard focus indicators across themes.
- Frontend-only update; no Worker deployment required.


## 1.7.0 — 2026-09-24

- Added favorites separate from watches, a Favorites filter, and optional must-do priorities in the For me sort.
- Added shared ride-history charts for today, 7 days, and 30 days, with bounded server sampling and explicit gaps.
- Preserved 1.6.6 notification schema initialization, scheduled alert health, diagnostics, and updated target wording.
- Kept public ride links compatible with the native app's sharing flow.
- Worker deployment required for `/api/ride/:id/history`; existing D1 tables are reused.


## 1.6.5 — 2026-09-24

- Fix native dropdown option contrast with opaque, theme-aware menu colors.

- Add a compact, theme-aware ten-segment crowd meter with the rating and trend.
- Put wait comparisons on a separate line and sample counts in an accessible expandable explanation.
- Preserve closed-park hiding. Frontend-only update; no Worker deploy required.

## 1.6.4 — 2026-09-24

- Hide crowd estimates outside current park operating hours, including before opening and at closing.
- Hide estimates when current hours are unavailable; recheck visibility every minute.
- Frontend-only update; no Worker deployment or schema changes required.

## 1.6.3 — 2026-09-24

- Render immediately while backend and push diagnostics run separately with timeouts.
- Show pending watch sync, retry while online, and serialize rule updates.
- Recover push-key failures without returning an unsubscribed object.
- Keep manual refresh separate from notification checkpoints and reject unknown wait alerts.
- Precache every runtime module, avoid caching HTTP errors, and restore last-good ride data offline.
- Preserve watch expiration on edits and fix ride-dialog keyboard focus.
- Requires applying the additive Worker schema before deploying the Worker.

## 1.6.2 — 2026-09-23

- Fixed collection selectors for navigation, first-run dismissal, and view jumps.
- Refreshed runtime, push, manifest, and PWA cache versions.

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
