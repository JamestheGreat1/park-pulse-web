# ParkPulse v0.15.2 QA Pass

## Automated/package checks performed
- JavaScript syntax check for every browser and Worker `.js` file.
- JSON parse check for `manifest.webmanifest`, `version.json`, and `worker/package.json`.
- Static-path check for every local stylesheet/script/icon referenced by `index.html` and `manifest.webmanifest`.
- Local HTTP smoke test for `index.html`, `manifest.webmanifest`, and `service-worker.js`.
- CSS brace/transition sanity check and VAPID key-generator smoke test.
- ZIP integrity check after packaging.

## Manual regression targets
- Jump For You → Settings → Plan → Waits repeatedly; no intermediate tab logic should fire.
- Scroll each tab to a different position, jump around non-linearly, then return; each tab should restore its own position.
- Open Add Attractions, scroll deep into Browse, select/deselect rows; rows should not jump sections or move.
- Search inside the picker after selecting rides; the selected count should persist.
- Add custom blocks between rides and edit/move/remove them.
- Start Park Day, Done/Skip several items, close/reopen the app, and confirm progress persists for the day.
- Cross midnight: daily completion/ridden state and active Park Day should reset; itinerary/favorites should remain.
- Kill internet: saved plan/favorites remain usable and cached waits show with an offline banner.
- Turn Reduce Motion on: no meaningful motion should remain.
- Test System, Light, and Dark plus all accent colors.
- Install to iPhone Home Screen before testing Web Push.
