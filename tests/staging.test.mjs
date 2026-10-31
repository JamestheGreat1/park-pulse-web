import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const production = read("worker/wrangler.toml");
const template = read("worker/wrangler.staging.toml.template");
const worker = read("worker/src/index.js");
const generator = read("worker/scripts/build-staging.mjs");
const productionId = production.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];

test("staging template has different Worker/database identities and no cron or production URLs", () => {
  assert.equal(productionId?.length, 36);
  assert.match(template, /^name = "parkpulse-api-staging"/m);
  assert.match(template, /^database_name = "parkpulse-staging"/m);
  assert.match(template, /^database_id = "__STAGING_D1_ID__"/m);
  assert.match(template, /^\[triggers\]$/m);
  assert.match(template, /^crons = \[\]$/m);
  assert.doesNotMatch(template, /^crons = \["/m);
  assert.doesNotMatch(template, /app\.useparkpulse\.com|jamesp5297|database_name = "parkpulse"/);
  assert.match(template, /^STAGING_MODE = "true"/m);
  assert.match(template, /^STAGING_ALLOW_PUSH = "false"/m);
  assert.match(template, /^STAGING_ENABLE_CRON = "false"/m);
  assert.match(template, /^STAGING_HISTORY_ONLY = "false"/m);
  assert.match(worker, /runStagingHistoryOnly/);
  assert.match(worker, /Staging alert engine disabled/);
  assert.match(worker, /url\.pathname\.startsWith\("\/subscriptions"\)/);
  assert.match(worker, /STAGING_PUSH_DISABLED/);
  assert.match(worker, /STAGING_ENABLE_CRON !== "true"/);
});

test("stage generator refuses missing UUID and production database ID", () => {
  const cmd = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  for (const args of [[], ["--database-id", productionId], ["--database-id", "not-a-uuid"]]) {
    const r = spawnSync(process.execPath, [cmd.pathname, ...args], { encoding:"utf8" });
    assert.notEqual(r.status, 0, "dangerous/missing DB ID should fail");
    assert.match(r.stderr, /STAGING BUILD BLOCKED/);
  }
});

test("stage source generator only mutates a copied catalog and not original flags", () => {
  const before = read("assets/js/catalog.js");
  const cmd = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  const stageId = "11111111-1111-4111-8111-111111111111";
  const r = spawnSync(process.execPath, [cmd.pathname, "--database-id", stageId], { encoding:"utf8" });
  assert.equal(r.status, 0, r.stderr);
  const output = read(".parkpulse-staging/worker/wrangler.toml");
  const catalog = read(".parkpulse-staging/assets/js/catalog.js");
  assert.match(output, /name = "parkpulse-api-staging"/);
  assert.match(output, new RegExp(stageId));
  assert.doesNotMatch(output, new RegExp(productionId));
  assert.match(catalog, /id: "dlr"[^\n]*enabled: true/);
  assert.match(catalog, /id: 16,[^\n]*enabled: true/);
  assert.match(catalog, /id: 17,[^\n]*enabled: true/);
  assert.match(before, /id: "dlr"[^\n]*enabled: false/);
  assert.equal(read("assets/js/catalog.js"), before);
  assert(existsSync(new URL("../.parkpulse-staging/worker/src/index.js", import.meta.url)));
  assert.match(output, /^\[triggers\]$/m);
  assert.match(output, /^crons = \[\]$/m);
});


test("history-only cron generator creates only the five-minute trigger", () => {
  const source = read("assets/js/catalog.js");
  const cmd = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  const uuid = "11111111-1111-4111-8111-111111111111";
  const r = spawnSync(process.execPath, [cmd.pathname, "--database-id", uuid, "--enable-history-cron"], {encoding:"utf8"});
  assert.equal(r.status, 0, r.stderr);
  const config = read(".parkpulse-staging/worker/wrangler.toml");
  assert.match(config, /^name = "parkpulse-api-staging"/m);
  assert.match(config, /^STAGING_ENABLE_CRON = "true"/m);
  assert.match(config, /^STAGING_HISTORY_ONLY = "true"/m);
  assert.match(config, /^\[triggers\]$/m);
  assert.match(config, /^crons = \["\*\/5 \* \* \* \*"\]$/m);
  assert.doesNotMatch(config, /17 \* \* \* \*|app\.useparkpulse\.com/);
  assert.equal(read("assets/js/catalog.js"), source);
});

test("staging scheduled handler never falls through to production alerts", async () => {
  const source = read("worker/src/index.js");
  const start = source.indexOf("  async scheduled(controller, env, ctx) {");
  const end = source.indexOf("\n};", start);
  assert(start !== -1 && end > start);
  const vm = await import("node:vm");
  const calls = [];
  const context = vm.createContext({
    console,
    runRideWatch: () => {throw new Error("Staging must never evaluate alerts");},
    runScheduledMaintenance: () => {throw new Error("Staging must never run maintenance");},
    runStagingHistoryOnly: async () => {calls.push("sample");}
  });
  const handler = vm.runInContext("({" + source.slice(start,end).trim() + "})", context);
  const ctx = {waitUntil: p => {p.catch(error => {throw error;});}};
  await handler.scheduled({cron:"*/5 * * * *"},{STAGING_MODE:"true",STAGING_ENABLE_CRON:"false",STAGING_HISTORY_ONLY:"false"},ctx);
  await handler.scheduled({cron:"*/5 * * * *"},{STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"false"},ctx);
  await handler.scheduled({cron:"17 * * * *"},{STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"true"},ctx);
  assert.deepEqual(calls,[]);
  await handler.scheduled({cron:"*/5 * * * *"},{STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"true"},ctx);
  assert.deepEqual(calls,["sample"]);
});

test("history-only sampler writes samples without alerts, checkpoints or historical backfill", async () => {
  const source = read("worker/src/index.js");
  const sample = source.slice(source.indexOf("async function runStagingHistoryOnly(env) {"),source.indexOf("async function runManualRefresh(env) {"));
  assert.match(sample,/await fetchCurrentRideSnapshot\(env\)/);
  assert.match(sample,/await writeCurrentRideSnapshot\(env, rides\)/);
  assert.doesNotMatch(sample,/runRideWatch|sendPush|enqueueRideAlerts|refreshRideBaselines/);
  const vm = await import("node:vm");
  let fetched = 0,written = 0;
  const ctx = vm.createContext({
    console,
    fetchCurrentRideSnapshot: async () => {fetched++;return {rides:[{id:"dl:test"}]};},
    writeCurrentRideSnapshot: async (_, rows) => {written++;assert.equal(rows.length,1);}
  });
  vm.runInContext(sample,ctx);
  const run = vm.runInContext("runStagingHistoryOnly",ctx);
  await assert.rejects(run({STAGING_MODE:"true",STAGING_ENABLE_CRON:"false",STAGING_HISTORY_ONLY:"true"}),/not explicitly enabled/);
  assert.equal(fetched,0);
  await run({STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"true"});
  assert.equal(fetched,1);
  assert.equal(written,1);
});
