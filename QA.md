# ParkPulse 1.6.3 QA

## Automated checks

- Run `node --test tests/regressions.test.mjs` from the repository root.
- For browser checks, install Playwright with `npm install --no-save --package-lock=false playwright` and `npx playwright install chromium`.
- Serve the repository with `python3 -m http.server 8765`, then run `node tests/browser-smoke.cjs` in another terminal.
- The browser test uses mocked park responses and a deliberately hanging health endpoint; it does not send real notifications.

## Release checks on installed devices

- Install from https://app.useparkpulse.com/ on iPhone and Android; confirm standalone launch.
- Upgrade an existing 1.6.2 installation, accept the update, close it, enable airplane mode, and relaunch. Confirm the shell and last-known rides load. Also interrupt an update and confirm the previous installed shell remains usable.
- Start with slow or unavailable backend diagnostics and confirm navigation and onboarding remain usable.
- Dismiss “Got it,” reload, and confirm it stays dismissed. Check Explore / Watching / Settings active navigation and view-jump buttons.
- Switch all four parks; check search, Open only, and all three sort modes.
- Create reopening-only, threshold-only, and combined watches. Edit a three-hour watch and confirm its original deadline is preserved; explicitly selecting another duration should change it.
- Fail the subscription POST while saving/removing a watch. Confirm pending-sync copy, no false success toast, and automatic recovery when online. Verify D1 contains the latest rules after rapid edits.
- Enable notifications, confirm “watches synced,” then use Settings → Send test with the app backgrounded. This checks device delivery, not cron evaluation.
- After applying schema.sql and deploying the Worker, let the first five-minute cron seed its notification checkpoint. Confirm subsequent real or controlled staging transitions deliver while the PWA is closed.
- Verify 60 → 30 triggers a target-40 alert; 60 → unknown does not; 60 → 0 does. Test reopening and morning opening suppression.
- Run a manual refresh between a transition and cron; confirm it cannot consume the transition.
- In staging, simulate a VAPID-key mismatch and replacement failure. Confirm no dead subscription is reported as synced. Do not rotate production keys for this test.
- Tap notifications with the app closed and backgrounded; confirm the exact ride opens.
- Verify light/dark/system themes, all accent colors, reduced motion, keyboard Tab/Shift+Tab/Escape in the ride dialog, and small-screen safe areas.

## Deployment

From the repository root in Codespaces:

```bash
git pull --ff-only origin main
cd worker
npm install
npx wrangler d1 execute parkpulse --remote --file=./schema.sql
npm run deploy
```

The schema adds `notification_ride_state`; it does not clear watches or history. The first scheduled run establishes a new baseline for notification transitions. Existing VAPID keys must be retained.
