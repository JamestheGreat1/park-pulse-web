# ParkPulse 2.1.0 — Final Release and Existing PWA Update Runbook

Status: **release procedure authorized on 2026-11-11; verify post-merge health before declaring success**.

Target release: 2.1.0. Stable app: https://app.useparkpulse.com/. Release branch: release/2.1.0-final-prep.

## Before merging

- Confirm final branch is mergeable and all CI checks are green, including the real browser simulation of upgrading a previously installed 2.0 PWA.
- Confirm root version.json, index.html, module query stamps, manifest icons, APP_VERSION, and service-worker cache identity are all exactly 2.1.0.
- Confirm manifest ID, start_url, scope, service-worker script URL, saved watch key (parkpulse.rideWatcher.v1), and PushManager registration scope remain unchanged.
- Confirm the live Cloudflare Worker, D1 schema, watch endpoints and VAPID settings are unmodified.
- Complete a manual iPhone Home Screen RC test with notification permission, real test push, notification tap, and watch sync.
- Set the release date in version.json and changelog at release time. Update the separate public landing site after release approval.

## Release sequence — requires explicit approval

1. Merge the final stable 2.1.0 PR. Do NOT merge the old RC PR as a stable release.
2. Verify GitHub Pages deployed and the public version.json reports 2.1.0.
3. Confirm the live index and asset URLs, service-worker cache name, APP_VERSION and manifest icons all use 2.1.0; do not deploy the Cloudflare Worker for this frontend-only release.
4. Reopen an **existing** installed ParkPulse PWA while online. Its 2.0 page checks the remote version on focus and periodically. It should display “A ParkPulse update is ready” with an Update button once the 2.1 worker is installed and waiting.
5. Tap Update. The old page sends SKIP_WAITING; the new 2.1 worker activates and the controllerchange handler reloads the original installed PWA. Its app identity, service-worker scope, saved watches, and push registration should remain the same.
6. Confirm saved favorites, watch thresholds/expirations, resort choice, glass style, accents, and notification permission. Send a test notification from Settings and tap it.
7. Go offline and reopen, then reconnect. Verify the shell loads, watches are present, ride data refreshes, and older shared links open the correct attraction.
8. Inspect live diagnostics: Worker online, alerts running, watches synced, history collecting, and correct version. Only then update the landing site and release announcement.

## Troubleshooting and rollback

- No Update banner: confirm online access and that version.json and service-worker.js have deployed; reopen the app or allow the five-minute recheck. Don't tell users to uninstall as that can lose local watches.
- Update stuck: verify every asset in the 2.1 service worker's SHELL exists. A missing asset blocks installation and leaves the old 2.0 worker active.
- Push issue: verify that the original same-scope registration persisted; retry synchronization or send a test notification. Do not regenerate VAPID keys or wipe subscription records without independent evidence.
- Roll back via a new coherent frontend version/cache and known-good assets. Avoid stripping locally saved state or restarting the unrelated Worker.

## Evidence and limitation

The automated upgrade test starts under a genuine 2.0 service worker on the same origin, switches to the candidate, observes and taps Update, verifies a 2.1 controller/cache with preserved watches and preferences, checks offline reload and existing ride deep links.

This is Chromium browser evidence. It does not prove iOS WebKit / Apple Push delivery on a particular user's Home Screen installation; real device testing remains necessary before the actual release.
