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
  assert.doesNotMatch(template, /\[triggers\]|^crons\s*=/m);
  assert.doesNotMatch(template, /app\.useparkpulse\.com|jamesp5297|database_name = "parkpulse"/);
  assert.match(template, /^STAGING_MODE = "true"/m);
  assert.match(template, /^STAGING_ALLOW_PUSH = "false"/m);
  assert.match(template, /^STAGING_ENABLE_CRON = "false"/m);
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
  assert.doesNotMatch(output, /\[triggers\]|^crons\s*=/m);
});
