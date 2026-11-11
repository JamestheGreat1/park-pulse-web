# ParkPulse 2.1.0 RC1 — iPhone Test Checklist

**Build:** 2.1.0-rc.1  
**RC app:** https://app.useparkpulse.com/rc-2-1/  
**Stable app:** https://app.useparkpulse.com/ (stays v2.0.0)  
**Status:** manually install/test; **not approved for stable release**

## Isolation and safety

The RC is a separate installable PWA with its own:
- Manifest app identity and title (`ParkPulse RC`).
- Service-worker registration scoped to `/rc-2-1/`, with cache named `parkpulserc-2.1.0-rc.1` (separate from stable `parkpulse-*` caches).
- Storage keys for watch rules, cached waits, first-run help, and appearance.
- Push subscription tied only to the RC service-worker registration; the RC will not read/update the stable app's subscription.

The RC reads live park data from the same existing Cloudflare Worker as stable ParkPulse. **Push notifications are optional** and only register with that Worker after explicitly enabling them inside the installed RC. A test push is a real, separately scoped subscription and will use the production Worker notification service. The candidate does not change the Worker, D1 schema or stable alert engine.

## On your iPhone

- [ ] Open the RC URL in **Safari**, not from the installed stable PWA.
- [ ] Tap **Share → Add to Home Screen**; name it **ParkPulse RC**. Launch from the new Home Screen icon.
- [ ] Confirm it looks like a separate app, and the regular ParkPulse icon/app still opens normally.
- [ ] Review all four tabs and both resorts; try Disneyland and DCA.
- [ ] Toggle Compact / Comfortable; hide/show Crowd pressure, Worth a Look, watch previews and park hours.
- [ ] Check dark/light mode and both Frosted / Liquid glass materials.
- [ ] Verify closed parks show the message in the overview, not a duplicate card.
- [ ] Add a **test watch** in the RC; confirm it is present only in RC, not the stable app.
- [ ] Test the RC offline (airplane mode or Wi-Fi off), reopen it, and confirm the shell and saved watch/preferences remain available.
- [ ] With RC back online, open RC **Settings**, explicitly enable notifications, and check push/watch sync status.
- [ ] In RC Settings, use **Test notification**. Tap the notification; confirm it opens/focuses the **RC icon/app**, not the normal stable installation.
- [ ] Test a deep link on the RC path (`/rc-2-1/?ride=<known-ride-id>`) and confirm it selects the right park and ride sheet. A true ride-triggered push opening the sheet requires an actual alert event; a generic test push only validates delivery/opening the RC app.
- [ ] Reopen stable ParkPulse: confirm its watch list, push status, favorites, resort selection and UI preferences were not changed.
- [ ] **Before uninstalling the RC test icon, disable RC push notifications in its Settings.** This unregisters its test subscription and avoids orphaned alerts.

## Release gates

1. RC branch checks: regression, browser, staging, dry-run Worker and release-version consistency.
2. Hosted RC checks: standalone SW scope, offline cache, localStorage isolation and no automatic Worker write on first use.
3. Manual iOS PWA notification delivery / deep-link confirmation.
4. Publish finalized user-facing site/README/changelog and stable 2.1.0 assets only after user approval.
5. Post-release monitor: Worker health, history collection, watch sync, update banner, offline shell and existing subscribers.

Do not merge the RC PR into `main` as the stable app. The approved production build should use `2.1.0` as a separate final version and a fresh service-worker cache once the tests pass and the release is authorized.
