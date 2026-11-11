# ParkPulse 2.1.0 — Release Readiness Audit

Status: **frontend candidate audited; production release NOT approved or deployed**.
Audit date: 2026-11-11. Original draft PR: https://github.com/JamestheGreat1/park-pulse-web/pull/10

## Verified

- [x] Accepted dashboard's rendering and complete CSS match the live 2.1 preview exactly (except intentional preview-only push/installation behavior). Tested in `tests/dashboard-release-audit.test.mjs`.
- [x] Existing `parkpulse.rideWatcher.v1` and `parkpulse.lastGoodRides.v1` storage keys remain the same. Legacy 2.0 saved favorites, watch rules, watch expiry, resort selection, and accent survive introducing dashboard defaults.
- [x] Normal production `push.js` and service worker integration remain in the feature branch. The hosted preview intentionally disables push and uses different storage; preview push tests are **not** evidence of real notification delivery.
- [x] Browser/offline smoke checks cover basic navigation, resort switching, dashboard toggles, watch creation and expiration preservation, app cache, offline relaunch, and deep links.
- [x] Extra preview tests cover compact KPI card alignment, hidden crowd, closed park status without duplicate cards, crowd trends and narrow viewports.
- [x] The full 2.1 branch was reconciled with newer `main` changes (including the Resorts geometry smoke test). PR #10 is mergeable and remains draft.
- [x] GitHub Actions workflow passed on branch commit `ae9bb6dc2649ee18daedf889a502cce73f4762f0`: https://github.com/JamestheGreat1/park-pulse-web/actions/runs/42968389075 (regression, browser/offline, staging frontend, dry-run Worker, source audit).
- [x] No production Worker code, D1 migrations, or push configuration changes are required by the 2.1 dashboard implementation.

## Blocking before 2.1.0 release

- [ ] **Version/cache coordination:** update `version.json`, `index.html` script/style and manifest references, all JS module import query stamps, `assets/js/app.js` APP_VERSION, and `service-worker.js` CACHE_NAME/VERSION/SHELL/notification icon references together. Avoid mixing 2.0 JS with 2.1 CSS or retaining old offline caches.
- [ ] **Release tests:** adjust the existing release-candidate test that currently asserts version `2.0.0`; ensure every asset and cache reference resolves to the selected 2.1 release candidate version and the old 2.0 caches roll over cleanly.
- [ ] **Documentation:** update `README.md`, `CHANGELOG.md`, public landing page at `useparkpulse.com` in its separate repository, and user-visible version/release text after candidate approval.
- [ ] **Real iOS standalone push confirmation:** on a subscribed device verify existing watch rules survive update, worker sync stays connected, a test notification is delivered, tapping it opens the right attraction in the PWA, and the notification bell/actions behave correctly. Do not assume the read-only preview proves this.
- [ ] **Visual/device acceptance:** verify compact and comfortable modes, all six parks, closed/event/unknown hour states, Frosted and Liquid Glass, dark/light modes, iPhone safe areas, and reduced motion on a real device. Existing preview visual approval is strong but is not an installed production-PWA upgrade test.
- [ ] **Final release gate:** run all CI checks on the versioned candidate, verify production health/alerts/history in read-only mode, prepare rollback, seek explicit owner approval, and only then merge and verify the PWA update.

## Deferred / non-blocking

- Swiping between tabs stays out of 2.1.0; revisit in a later release after gesture and accessibility tests.
- Optional CSS consolidation can happen separately. Do not destabilize the approved design merely to refactor styling.

## Safety

This audit and all preview work are frontend/branch-only. No production deploy is authorized by this document. Never merge PR #10 without explicit approval after the candidate release gate.
