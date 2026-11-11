# ParkPulse 2.1 — dashboard design decisions (draft)

Status: implementation preview on `feature/2.1-compact-dashboard`, not released.

## Approved product direction

- Evolve the existing ParkPulse 2.0 interface; do not rebuild its architecture.
- Remove the promotional "Stop refreshing wait times" hero from Explore.
- Put the selected park's current conditions first.
- Default to **Compact**, with a **Comfortable** density option.
- Park overview always shows the selected resort and park, known operating count, and median live posted wait.
- Crowd pressure is enabled by default, but a comparison must not be invented when data is unreliable, missing, or a special event is active.
- **Worth a Look** shows one candidate using the existing Next Up / Best Now logic. A "better than typical" claim appears only with valid historical comparison data.
- Show **Your Watches** only when the preference is enabled **and** active watches exist. Limit the preview to two; use Watching for complete management.
- Park hours can be shown or hidden in the overview; existing schedule and special-event status remain available.
- Keep attraction cards, park selector, four bottom tabs, accent themes, Frosted/Liquid Glass, and push/watch synchronization.
- Dashboard preferences are in Settings and saved locally; no new backend storage.
- Horizontal swipe between navigation tabs remains **optional/deferred**, subject to gesture and accessibility testing.

## Data and display rules

- Operating numerator and denominator use fresh, non-missing attraction statuses only. Accessible wording describes the denominator as attractions with fresh status.
- Median live wait uses fresh, open rides with known numeric posted waits, not historical baselines.
- Unavailable counts and estimates display an em dash instead of zero or unsupported precision.
- A genuine closed park retains the existing closed-state explanation rather than an ordinary recommended ride.
- Source and API freshness remains visible; do not invent actual queue throughput or attendance.
- All six parks and cross-resort watches must continue to work.

## Proposed validation

1. Check dashboard at narrow iPhone widths, light and dark, Frosted and Liquid.
2. Verify selected park and resort persistence, selected park changing, and existing ride sheets.
3. Verify two density choices, all section visibility toggles and offline reload persistence.
4. Confirm zero-watch layout takes up no space, and active previews show correct cross-resort rides.
5. Test stale/closed/event/unknown data; verify no fake crowd estimate or "better than typical" claim.
6. Confirm favorites, Best Now sort, watches, push synchronization, pull-to-refresh, and reduced motion.
7. Use GitHub Actions and isolated staging preview. Do not merge or deploy production without product-owner approval.

## Release log

- **Unreleased 2.1 preview:** Park-first summary, compact recommendation and watch previews, local dashboard preferences, responsive spacing.
- **Not yet included:** swipe navigation, backend or schema changes, public deployment, release version bump.
