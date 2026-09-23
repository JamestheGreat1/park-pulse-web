#!/usr/bin/env bash
set -Eeuo pipefail

SKIP_GIT_PUSH=false
if [[ "${1:-}" == "--skip-git-push" ]]; then
  SKIP_GIT_PUSH=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: ./deploy-cloudflare.sh [--skip-git-push]" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$ROOT/worker"
WRANGLER_CONFIG="$WORKER_DIR/wrangler.toml"
FRONTEND_CONFIG="$ROOT/assets/js/config.js"

step() {
  printf '\n==> %s\n' "$1"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || die "'$1' is required but was not found."
}

require node
require npm
require npx
require git
require curl

[[ -f "$WRANGLER_CONFIG" ]] || die "Run this from the ParkPulse repo. worker/wrangler.toml is missing."

cd "$WORKER_DIR"

step "Installing Worker dependencies"
npm install

step "Checking Cloudflare authorization"
set +e
WHOAMI="$(npx wrangler whoami 2>&1)"
WHOAMI_STATUS=$?
set -e

if [[ $WHOAMI_STATUS -ne 0 ]] || grep -qiE 'not authenticated|not logged in' <<<"$WHOAMI"; then
  echo "Wrangler needs Cloudflare authorization."
  echo "Follow the login link/prompt that Wrangler gives you."
  npx wrangler login
else
  echo "$WHOAMI"
fi

step "Checking the existing ParkPulse Worker secrets"
SECRETS_JSON="$(npx wrangler secret list --format json)"

missing=()
for name in VAPID_SERVER_PRIVATE_KEY THEMEPARKS_API_KEY; do
  if ! grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"$name\"" <<<"$SECRETS_JSON"; then
    missing+=("$name")
  fi
done

if (("${#missing[@]}" > 0)); then
  echo
  echo "The deployed Worker is missing: ${missing[*]}" >&2
  echo
  if printf '%s\n' "${missing[@]}" | grep -qx 'THEMEPARKS_API_KEY'; then
    echo "Set the ThemeParks history key with:"
    echo "  cd worker"
    echo "  npx wrangler secret put THEMEPARKS_API_KEY"
    echo "  cd .."
    echo "  ./deploy-cloudflare.sh"
    echo
  fi
  if printf '%s\n' "${missing[@]}" | grep -qx 'VAPID_SERVER_PRIVATE_KEY'; then
    echo "Do NOT generate a replacement VAPID private key unless you intend to invalidate existing push subscriptions."
    echo "Restore the existing VAPID secret first, then rerun this script."
    echo
  fi
  exit 1
fi

echo "Required Worker secrets are present."

step "Applying the D1 schema"
npx wrangler d1 execute parkpulse --remote --file=./schema.sql

step "Deploying the ParkPulse Worker"
DEPLOY_LOG="$(mktemp)"
trap 'rm -f "$DEPLOY_LOG"' EXIT

set +e
npx wrangler deploy 2>&1 | tee "$DEPLOY_LOG"
DEPLOY_STATUS=${PIPESTATUS[0]}
set -e

[[ $DEPLOY_STATUS -eq 0 ]] || die "Wrangler deploy failed with exit code $DEPLOY_STATUS."

WORKER_URL="$(grep -Eo 'https://[A-Za-z0-9.-]+\.workers\.dev' "$DEPLOY_LOG" | tail -n 1 || true)"

if [[ -z "$WORKER_URL" && -f "$FRONTEND_CONFIG" ]]; then
  WORKER_URL="$(node - "$FRONTEND_CONFIG" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const text = fs.readFileSync(path, "utf8");
const match = text.match(/WORKER_BASE:\s*"([^"]+)"/);
if (match) process.stdout.write(match[1].replace(/\/$/, ""));
NODE
)"
fi

[[ "$WORKER_URL" =~ ^https://[A-Za-z0-9.-]+\.workers\.dev$ ]] ||
  die "Could not determine the workers.dev URL from Wrangler output or assets/js/config.js."

step "Connecting the PWA to $WORKER_URL"
node - "$FRONTEND_CONFIG" "$WORKER_URL" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const url = process.argv[3];
let text = fs.readFileSync(path, "utf8");
if (!/WORKER_BASE:\s*"[^"]*"/.test(text)) {
  throw new Error("WORKER_BASE was not found in assets/js/config.js");
}
text = text.replace(/WORKER_BASE:\s*"[^"]*"/, `WORKER_BASE: "${url}"`);
fs.writeFileSync(path, text);
NODE

step "Testing the live Worker"
HEALTH=""
for attempt in 1 2 3 4 5 6; do
  if HEALTH="$(curl -fsS --max-time 20 "$WORKER_URL/health" 2>/dev/null)"; then
    break
  fi
  if [[ $attempt -eq 6 ]]; then
    die "The Worker deployed, but /health did not respond successfully."
  fi
  sleep 2
done

HEALTH_JSON="$HEALTH" node <<'NODE'
const h = JSON.parse(process.env.HEALTH_JSON || "{}");
if (!h.ok || h.service !== "parkpulse-api") {
  throw new Error("Unexpected Worker health response.");
}
if (!h.themeParksApiKeyConfigured) {
  throw new Error("THEMEPARKS_API_KEY is not configured on the deployed Worker.");
}
console.log(`Worker ${h.version || "?"}: healthy`);
console.log(`ThemeParks history key: connected`);
console.log(`Live freshness window: ${h.liveFreshnessMinutes ?? "?"} min`);
NODE

step "Checking ParkPulse history collection"
ANALYTICS="$(curl -fsS --max-time 20 "$WORKER_URL/api/analytics/status")"

ANALYTICS_JSON="$ANALYTICS" node <<'NODE'
const a = JSON.parse(process.env.ANALYTICS_JSON || "{}");
if (!a.ok) throw new Error("History diagnostics are not ready.");

const total = Number(a.totalRides || 0);
const ready = Number(a.baselineRides || 0);
const errors = Number(a.errorRides || 0);
const recentRides = Number(a.recentHistoryRides || 0);
const recentSamples = Number(a.recentHistorySamples || 0);

if (a.historyCollecting) {
  console.log(`History sampler: Collecting (${recentRides} rides / ${recentSamples} samples in the last ${a.historyHealthWindowMinutes || 20} min)`);
  console.log(`Latest sample: ${a.latestHistorySample || "unknown"}`);
} else if (a.latestHistorySample) {
  console.warn(`History sampler: NOT CURRENT — last sample ${a.latestHistorySample}`);
} else {
  console.warn("History sampler: waiting for its first D1 sample. The cron runs every five minutes.");
}

console.log(`Trend baselines: ${ready}/${total} rides ready`);
if (errors > 0) console.warn(`Baseline backfill errors: ${errors}`);

if (a.themeParksApiKeyConfigured === false) {
  throw new Error("Historical backfill is disabled because THEMEPARKS_API_KEY is missing.");
}
NODE

cd "$ROOT"

if [[ "$SKIP_GIT_PUSH" == false ]]; then
  step "Publishing any configuration change"
  git add -- assets/js/config.js worker/wrangler.toml
  if ! git diff --cached --quiet; then
    git commit -m "Configure ParkPulse Worker deployment"
    git push origin main
  else
    echo "GitHub configuration is already current."
  fi
fi

echo
echo "ParkPulse deployment is complete."
echo "Worker: $WORKER_URL"
echo "PWA: https://app.useparkpulse.com/"
echo
echo "No push keys were regenerated. Existing Worker secrets were reused."
