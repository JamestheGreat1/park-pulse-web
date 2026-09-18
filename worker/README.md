# ParkPulse Web Push / Queue Proxy Worker

This optional Cloudflare Worker does two jobs for ParkPulse v0.15.2:

1. proxies Queue-Times data so GitHub Pages never depends on browser CORS behavior;
2. stores Web Push subscriptions and checks every five minutes for watched rides that transition from closed to open.

## Setup

1. Install dependencies: `npm install`
2. Create a D1 database: `npx wrangler d1 create parkpulse`
3. Put the returned database ID in `wrangler.toml`.
4. Create the tables: `npx wrangler d1 execute parkpulse --remote --file=./schema.sql`
5. Generate a VAPID key pair: `npm run generate-vapid`
6. Put the **public** key in `wrangler.toml` as `VAPID_SERVER_PUBLIC_KEY`.
7. Store the private key as a Worker secret: `npx wrangler secret put VAPID_SERVER_PRIVATE_KEY`
8. `APP_URL`, `APP_ORIGIN`, and `VAPID_SUBJECT` are prefilled for `JamestheGreat1/park-pulse-web`; change them only if you deploy somewhere else.
9. Optional test endpoint protection: `npx wrangler secret put PUSH_ADMIN_TOKEN`
10. Deploy: `npm run deploy`
11. Copy the deployed Worker origin into `../assets/js/config.js` as `WORKER_BASE` and redeploy the static site.

The scheduled trigger runs every five minutes. The first run seeds ride state and intentionally sends no reopen notifications.
