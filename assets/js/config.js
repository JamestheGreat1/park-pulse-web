// ParkPulse v0.15.2 runtime configuration.
// After deploying the included Cloudflare Worker, set WORKER_BASE to its origin
// (for example: "https://parkpulse-api.your-subdomain.workers.dev").
window.PARKPULSE_CONFIG = Object.freeze({
  WORKER_BASE: "https://parkpulse-api.jamesp5297.workers.dev",
  REFRESH_INTERVAL_MS: 5 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 12 * 1000
});
