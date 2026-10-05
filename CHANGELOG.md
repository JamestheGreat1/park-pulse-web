# Changelog

## 1.9.3 — 2026-10-05

- Added an explicit **OPEN**, **CLOSED**, **EVENT TRANSITION**, or **SPECIAL EVENT** pill beside the selected park name.
- Added compact status dots to every park selector chip so closed parks are visible before switching tabs.
- When a park is genuinely closed, **Next Up** is replaced with a compact closed-state card while ride history, favorites, and attraction details remain available.
- Ticketed-event transitions and active special events stay distinct from true closures, so MNSSHP waits are not mislabeled as a closed park.
- Park status refreshes from the existing schedule data without any Worker or D1 changes.
- Bumped frontend cache/version keys so installed PWAs receive the 1.9.3 update.

## 1.9.2 — 2026-10-01

- Keep fresh attraction-level wait times visible when regular park hours end before a same-day ticketed event.
- Recognize the ticketed-event transition window separately from the active event.
- Label the handoff as **Event transition** and the active period as **Special event now** while preserving the named ticketed-event schedule below it.
- Pause normal-day wait comparisons and crowd-pressure analytics during the handoff and ticketed event instead of comparing party waits against normal operations.
- Added regression coverage proving that an attraction can remain `OPERATING` with a live standby wait even when the parent park entity reports `CLOSED`.
- Worker 1.7.4 is required for backend-side comparison suppression. No D1/schema migration is required.

## 1.9.1 — 2026-09-26

- Removed the native iOS Universal Link association so shared ride URLs no longer prefer the native app.
- Kept canonical `https://app.useparkpulse.com/?ride=...` sharing and immediate ride-detail deep linking on the web.
- Added a compact PWA handoff inside ride details when a shared link opens on a mobile browser.
- iPhone/iPad shared links now explain the Home Screen experience and reuse ParkPulse's existing Add to Home Screen guide.
- Android shared links reuse the existing install flow when available.
- The PWA handoff is hidden when ParkPulse is already running in standalone mode.
- Bumped frontend cache/version keys so installed PWAs receive the 1.9.1 update.
- Frontend-only update; no Worker deployment required.

## 1.9.0 — 2026-09-26

- Added Apple Universal Link support for shared ParkPulse ride URLs.
- Shared rides now always use the canonical `https://app.useparkpulse.com/?ride=...` URL, including links created from preview or alternate hosts.
- Published the Apple App Site Association file for the ParkPulse native iOS app so matching ride links can open the installed app directly.
- Kept the same URL as the web fallback when the native app is not installed or the link is opened in a browser context.
- Added regression coverage for the canonical share host and Apple association rules.
- Bumped frontend cache/version keys so installed PWAs receive the 1.9.0 update.
- Frontend-only web release; no Worker deployment required.

## 1.8.18 — 2026-09-26

- Added dedicated darker accent colors for Light mode across all eight ParkPulse color profiles.
- Kept the ambient glow palette bright, so backgrounds still feel colorful while text, icons, selected states, and controls gain contrast.
- Darkened Light-mode muted copy and semantic green/red so helper text and status labels remain readable on bright glass.
- Applied the same palette automatically when System theme resolves to Light.
- Dark mode is unchanged.
- Bumped frontend cache/version keys so installed PWAs receive the update.
- Frontend-only update; no Worker deployment required.

## 1.8.17 — 2026-09-26

- Reworked light-mode ride sheets into denser, more neutral milky glass so text stays readable over bright ambient backgrounds.
- Reduced backdrop saturation for both Liquid and Frosted Glass while preserving blur, translucency, and the selected accent.
- Darkened secondary/helper copy throughout the sheet, including watch controls, chart labels, metrics, and contextual text.
- Strengthened light-mode chart lines and gave selects/buttons subtle neutral surfaces so controls no longer disappear into the glass.
- Dark mode and non-sheet surfaces are unchanged.
- Bumped frontend cache/version keys so installed PWAs receive the update.
- Frontend-only update; no Worker deployment required.

## 1.8.16 — 2026-09-26

- Improved light-mode readability inside ride sheets without changing the glass backgrounds or layout.
- Darkened muted helper text, trend labels, chart labels, and summary captions that could wash out over bright glass.
- Uses a darker accent-text variant for ride land labels, comparison callouts, and the share icon while preserving the selected accent color.
- Bumped frontend cache/version keys so installed PWAs receive the update.
- Frontend-only update; no Worker deployment required.

## 1.8.15 — 2026-09-26

- Fixed Frosted Glass color changes so accent and theme updates snap immediately, matching the existing Liquid Glass behavior.
- Extended the existing one-frame glass repaint handling to Frosted Glass without changing its styling or layout.
- Bumped frontend cache/version keys so installed PWAs receive the fix.
- Frontend-only update; no Worker deployment required.

## 1.8.14 — 2026-09-25

- Removed the remaining Liquid Glass specular/caustic overlay from ride sheets, eliminating the dark shaded band that could appear near the bottom while scrolling.
- Kept the ride sheet's glass material, blur, border, outer shadow, scrolling, and desktop/mobile layout intact.
- Preserves the 1.8.13 threshold-control geometry and all recent seasonal/chart cleanup.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.13 — 2026-09-25

- Fixed the desktop wait-time target controls for Windows scaling/browser zoom by applying the centered geometry from 700px upward instead of relying on the old 1024px desktop breakpoint.
- Locked the − / value / unit / + cluster to a deterministic width with guaranteed side clearance.
- Removed the Liquid Glass inner rim from ride sheets so its curved border can no longer visually cut through form controls.
- Keeps the recent seasonal, chart, mobile-scroll, and desktop-density fixes intact.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.12 — 2026-09-25

- Fixed the desktop wait-time target controls so the − / value / unit / + cluster is centered beneath the setting instead of being anchored against the right edge.
- Added guaranteed side breathing room so the + button cannot be clipped by the ride-sheet boundary on narrower desktop windows.
- Keeps the 1.8.11 chart cleanup and seasonal desktop parity fixes intact.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.11 — 2026-09-25

- Removed the redundant “avg Xm” label from inside wait-history charts while keeping the dashed average reference line.
- The Average summary card below the chart remains the single place that displays the numeric average.
- Includes the desktop wait-target clipping and seasonal-parity fixes from 1.8.10.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.10 — 2026-09-25

- Fixed desktop wait-target controls so the − / value / unit / + group stays compact and cannot run into or clip against the ride-sheet edge.
- Boosted desktop seasonal ambience slightly so it remains visible behind the wider desktop glass layout.
- Added a static seasonal fallback when the OS/browser requests reduced motion, preserving seasonal color and decoration without forcing animation.
- Kept the 1.8.8/1.8.9 ride-sheet divider and glass-shading cleanup intact.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.9 — 2026-09-25

- Softened desktop ride-card glass highlights so wide light-mode cards no longer show a harsh diagonal/dark shading band.
- Reduced the desktop Liquid Glass inner-rim intensity and hover shift while preserving the frosted/refractive look.
- Verified seasonal effects use the same rendering path on desktop and mobile; no desktop-only seasonal suppression was found.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.8 — 2026-09-25

- Tightened desktop ride-sheet spacing and reduced the modal to a denser 640px layout while keeping viewport-capped scrolling.
- Shortened the desktop wait-history chart and compacted the stats, trend, and watch-control sections so the sheet reads more like a desktop form.
- Removed the duplicate divider below wait history so watch controls use one clean separator per section.
- Removed the mobile Liquid Glass inner overlay layers from scrollable ride sheets to eliminate dark bands and doubled-looking lines while preserving the outer glass treatment.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.7 — 2026-09-25

- Resized desktop ride sheets to a more compact 680px modal so they fit normal monitor layouts more comfortably.
- Re-enabled vertical scrolling on desktop with a subtle thin scrollbar when the ride sheet is taller than the available viewport.
- Kept the modal centered and preserved the separate mobile scrolling behavior.
- Frontend-only hotfix; no Worker deployment required.

## 1.8.6 — 2026-09-25

- Removed a stray horizontal Liquid Glass seam that could appear near the bottom of scrollable ride sheets on iPhone/iPad.
- Kept the outer glass border and mobile scrolling behavior intact; only the conflicting inner refractive rim is suppressed on mobile ride sheets.
- Frontend-only hotfix; no Worker deployment required.

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
