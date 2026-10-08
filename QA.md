# ParkPulse release QA

The release version is defined in `version.json`. **Do not hard-code release versions in tests.**
This checklist covers the ParkPulse 1.9.4 feature set and should be revisited when features change.

## Automated checks (required before a release)

GitHub Actions runs both checks on every push to `main` and on pull requests:
- **Regression:** `node --test tests/regressions.test.mjs` — Worker notification/state logic and source-level frontend regressions.
- **Browser smoke:** `node tests/browser-smoke.cjs` — Chromium, mocked ride data, startup with an unresponsive health endpoint, navigation, watch expiration, offline shell and cached assets.

To run locally from the repository root:

```bash
node --test tests/regressions.test.mjs
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium
python3 -m http.server 8765
```

In a second terminal run `node tests/browser-smoke.cjs`. The browser smoke test reads the current version from `version.json`, verifies the matching service-worker cache and its core assets, and does not send real notifications.

These checks are **not** a substitute for device testing or production Worker monitoring. If a workflow fails, investigate and fix the test or product before shipping. GitHub branch protection can optionally require both checks before merging PRs.

## Manual release checks on real devices

### Installation, PWA, and basic behavior
- On iPhone/iPad (Safari) and Android, verify browser use, standalone install and launch, and the update banner.
- Upgrade an existing installed version; confirm the new shell appears, then test airplane-mode relaunch with last-known rides. Interrupt an update and ensure the previous shell remains usable.
- With slow/unavailable diagnostics, confirm navigation, onboarding, and the rest of the interface remain usable.
- Dismiss “Got it,” reload, and confirm it stays dismissed. Check Explore, Watching, Settings and in-view navigation.
- Switch all four parks. Check search, Open only, Favorites, Best Now / Lowest wait / A–Z sorts, Next Up, and crowd-pressure labels.
- Check narrow mobile and scaled desktop layouts, sheet scrolling/dismiss gestures, keyboards and focus/Escape behavior, safe areas, and reduced-motion support.

### Time, event handoff, and visual preferences
- With **Use my local time** on (default), verify park hours, event times and history timestamps show device-local time and an intelligible timezone label. Turn it off and verify Orlando time. Park open/closed logic must remain based on Orlando time.
- Check OPEN, CLOSED, EVENT TRANSITION and SPECIAL EVENT status pills plus selector dots; a truly closed park must show a closed-state Next Up card.
- During an event handoff, confirm attraction-level `OPERATING` waits remain visible even if the parent park reports `CLOSED`; suppress **normal-day** baselines and crowd comparisons during handoff/party.
- Check Light/Dark/System, eight accent colors, Frosted/Liquid glass, high-contrast labels and reduced motion. Check seasonal effects on desktop and mobile.
- Open a shared ride URL on desktop, mobile browser and installed PWA; confirm the exact ride opens and install handoff only appears in mobile browser mode.

### Watches and backend (when Worker/notification code changes)
- Test reopening-only, target-only, combined and expiring watches. Editing a three-hour watch must preserve its original deadline unless explicitly changed.
- Fail subscription POST while creating/removing watches. Verify pending-sync state, no false success, and recovery when back online; verify D1's latest rules after rapid edits.
- Send a background-device test notification. **Test push** proves device delivery, not scheduled cron evaluation.
- On staging or controlled live data, verify 60 → 30 crosses a target of 40; 60 → unknown does not; 60 → 0 does. Test reopening and morning-opening suppression.
- Confirm a manual refresh between a transition and the scheduled alert job does not consume that notification transition.
- For Worker deployments, check `/health` reports the expected backend version, scheduled five-minute alert checks complete, hourly baseline maintenance runs, and D1 history/checkpoints advance without CPU-limit failures.
- Test VAPID key mismatches only in staging; never rotate production VAPID keys for a test.

## Deployment boundaries

- **Frontend/test/docs-only change:** GitHub Pages publishes the site; no Worker deployment or D1 migration needed.
- **Worker change:** deploy Worker separately from `worker/` using `npm ci` and `npm run deploy`; verify health and cron afterward.
- **Database schema change:** run the documented migration only when the change requires it. Do not blindly reapply schema or rotate secrets for ordinary frontend releases.

The current Worker initializes its notification checkpoint tables automatically. If deployed to a fresh environment, consult `worker/README.md` for the complete schema and secrets setup.
