# ParkPulse Seasonal Preview

This branch is the private test bed for ParkPulse seasonal overlays.

## Branch

`preview/seasonal-overlays`

Preview version: `1.8.0-preview.1`

Production `main` remains unchanged until the seasonal work is explicitly approved and merged.

## What is included

- Automatic Halloween, Christmas, Easter, and Fourth of July date windows.
- Seasonal ambience layered underneath the existing user accent.
- Ride status colors remain unchanged.
- Reduced Motion disables seasonal particles.
- Preview-only overlay selector and intensity selector.
- URL overrides such as `?season=halloween` only work on the protected preview hostname (or localhost).
- A persistent PREVIEW badge on the protected preview hostname.

## Intended preview hostname

`preview.useparkpulse.com`

The manual preview controls only render on:

- `preview.useparkpulse.com`
- `localhost`
- `127.0.0.1`

They do not render on `app.useparkpulse.com`.

## Cloudflare Pages build

Recommended Pages project settings:

- Repository: `JamestheGreat1/park-pulse-web`
- Production branch for the Pages project: `main`
- Framework preset: None
- Build command:

```sh
rm -rf dist && mkdir dist && cp -R index.html manifest.webmanifest service-worker.js version.json assets dist/
```

- Build output directory: `dist`

Then allow preview deployments only for `preview/seasonal-overlays`.

Cloudflare Pages can put preview deployments behind Cloudflare Access. Enable that before using the preview URL with testers.

## Custom branch domain

After the branch has a successful Pages preview deployment, attach `preview.useparkpulse.com` to the Pages project and point its proxied CNAME at the branch alias for this branch.

Because Pages normalizes branch aliases, check the deployment details in Cloudflare and copy the exact alias it shows instead of guessing it.

Protect `preview.useparkpulse.com` with a Cloudflare Access Self-hosted application and an Allow policy containing only approved tester email addresses.

## Preview controls

In Settings, the protected preview build includes a **Preview lab** section.

Overlay options:

- Automatic
- None
- Halloween
- Christmas
- Easter
- Fourth of July

Intensity options:

- Subtle
- Normal
- Extra

URL overrides:

- `?season=halloween`
- `?season=christmas`
- `?season=easter`
- `?season=july4`
- `?season=none`
- `?season=auto`

URL overrides are ignored outside the protected preview hostname/localhost.

## Automatic date windows

- Halloween: October 1–31
- Christmas: November 20–December 31
- Easter: 10 days before Easter through Easter Monday
- Fourth of July: July 1–5

## Before production

Test each season in light and dark mode, with representative accent colors, on iPhone/PWA and desktop. Confirm Reduced Motion removes particles and that operational status colors stay visually distinct.
