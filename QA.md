# ParkPulse v1 QA

- Install from GitHub Pages and confirm standalone launch.
- Switch all four WDW parks and verify live rides populate.
- Search, Open only, and all three sort modes.
- Create reopening-only, threshold-only, and combined watches.
- Verify Today / 3 hours / Until disabled expirations persist after reload.
- Enable Web Push and confirm rules sync to the Worker.
- Close the PWA and use `/send/test` with the admin token to verify a background notification.
- Confirm a wait alert fires only when the wait crosses from above the target to at/below it.
- Confirm a reopening alert fires on closed → open while the park is operating.
- Verify light/dark/system themes, reduced motion, small-screen safe areas, and iPhone Home Screen layout.
- Confirm the Queue-Times attribution is visible.
