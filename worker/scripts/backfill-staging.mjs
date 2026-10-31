#!/usr/bin/env node
// ParkPulse 2.0: manually initiated, paced historical backfill for STAGING ONLY.
// Reads the existing local staging refresh token. Never modifies deployments.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const stageDir = join(root, ".parkpulse-staging");
const configPath = join(stageDir, "worker", "wrangler.toml");
const tokenPath = join(stageDir, "refresh-token");
const productionConfigPath = join(root, "worker", "wrangler.toml");
const endpoint = "https://parkpulse-api-staging.jamesp5297.workers.dev";
const maxBatches = 26; // Explicit cap: 104 ride attempts at most per invocation.
const delayBetweenBatchesMs = 40_000; // ~6 history calls/minute, intentionally paced.
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";

function abort(message) {
  console.error("STAGING BACKFILL STOPPED: " + message);
  process.exit(1);
}
if (process.argv.length > 2 && !checkOnly) {
  abort('Supported usage: node worker/scripts/backfill-staging.mjs [--check]');
}
if (!existsSync(configPath) || !existsSync(productionConfigPath)) {
  abort("Generate the isolated staging Worker first; configuration is missing.");
}

const stagingConfig = readFileSync(configPath, "utf8");
const productionConfig = readFileSync(productionConfigPath, "utf8");
const stageId = stagingConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
const productionId = productionConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];

if (!/^name\s*=\s*"parkpulse-api-staging"$/m.test(stagingConfig) ||
    !/^database_name\s*=\s*"parkpulse-staging"$/m.test(stagingConfig) ||
    !/^STAGING_MODE\s*=\s*"true"$/m.test(stagingConfig) ||
    !/^STAGING_ALLOW_PUSH\s*=\s*"false"$/m.test(stagingConfig) ||
    !/^STAGING_HISTORY_ONLY\s*=\s*"true"$/m.test(stagingConfig) ||
    !/^STAGING_ENABLE_CRON\s*=\s*"true"$/m.test(stagingConfig) ||
    !stageId || !productionId || stageId === productionId) {
  abort("Staging identity, isolated database or safety flags are not verified.");
}
if (checkOnly) {
  console.log("STAGING BACKFILL CONFIG OK: staging-only, separate D1, history-only cron.");
  process.exit(0);
}
if (!existsSync(tokenPath)) {
  abort("The private .parkpulse-staging/refresh-token is missing.");
}
const refreshToken = readFileSync(tokenPath, "utf8").trim();
if (!/^[a-f0-9]{64}$/i.test(refreshToken)) {
  abort("Invalid staging refresh token format; no request sent.");
}

const stopController = new AbortController();
process.on("SIGINT", () => {
  console.log("\nInterrupted; all successfully completed batches remain saved in staging D1.");
  stopController.abort();
  process.exit(130);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestJson(path, method = "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(endpoint + path, {
      method,
      headers: method === "POST"
        ? { Authorization: "Bearer " + refreshToken, Accept: "application/json" }
        : { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Staging API returned HTTP " + response.status +
      (response.status === 429 ? " (rate limited; stop instead of retrying)" : ""));
    if (!body || body.ok !== true) throw new Error("Staging API returned an unsuccessful or invalid response.");
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const status = await requestJson("/api/analytics/status");
  if (!Number.isInteger(status.totalRides) || status.totalRides < 1 ||
      !Number.isInteger(status.baselineRides)) {
    abort("Staging analytics status is incomplete.");
  }
  if (!status.historyCollecting) {
    abort("History collection is not healthy; investigate staging cron before backfilling.");
  }

  console.log("ParkPulse 2.0 staging baseline backfill");
  console.log("Ready " + status.baselineRides + "/" + status.totalRides +
    " | remaining " + status.pendingRides + " | paced 4 rides/batch");
  if (status.pendingRides === 0) {
    console.log("Already complete. No history requests were sent.");
    process.exit(0);
  }

  let previousReady = status.baselineRides;
  for (let round = 1; round <= maxBatches; round++) {
    const result = await requestJson("/api/admin/baselines", "POST");
    if (result.staging !== true || Number(result.polledParks) !== 0 ||
        !result.baseline || !result.analytics) {
      abort("Unexpected response; refusing further requests.");
    }
    const { processed, refreshed, failed } = result.baseline;
    const { totalRides, baselineRides, pendingRides, errorRides } = result.analytics;
    console.log("Batch " + round + ": +" + refreshed + " refreshed | " +
      baselineRides + "/" + totalRides + " complete | " + pendingRides +
      " remaining | history IDs mapped " + (result.mappedRides ?? "?") +
      "/" + result.eligibleRides);

    if (failed > 0 || errorRides > 0) {
      abort("An upstream history request or stored baseline failed. Check /api/analytics/status errors.");
    }
    if (!Number.isInteger(processed) || processed < 0 || processed > 4 ||
        !Number.isInteger(refreshed) || refreshed < 0 || refreshed > processed ||
        !Number.isInteger(baselineRides) || baselineRides < previousReady) {
      abort("Invalid batch accounting; stopping safely.");
    }
    if (pendingRides === 0) {
      console.log("SUCCESS: all " + totalRides + " baselines processed in staging.");
      process.exit(0);
    }
    if (processed === 0 || refreshed === 0 || baselineRides <= previousReady) {
      abort("Backfill made no progress. Check missing source IDs or recent sample health.");
    }
    previousReady = baselineRides;
    if (round < maxBatches) {
      console.log("Cooling down before the next batch (40 seconds); Ctrl+C stops safely.");
      await pause(delayBetweenBatchesMs);
    }
  }
  console.log("Stopped at the safety cap of " + maxBatches +
    " batches. Check /api/analytics/status before restarting.");
} catch (error) {
  abort(error instanceof Error ? error.message : "Unknown network error.");
}
