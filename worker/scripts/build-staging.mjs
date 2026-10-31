#!/usr/bin/env node
// Build a staging-only copy. Does not authenticate or deploy anything.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const prodConfig = readFileSync(join(projectRoot, "worker/wrangler.toml"), "utf8");
const template = readFileSync(join(projectRoot, "worker/wrangler.staging.toml.template"), "utf8");
const catalog = readFileSync(join(projectRoot, "assets/js/catalog.js"), "utf8");
const argIndex = process.argv.indexOf("--database-id");
const uuid = argIndex < 0 ? "" : String(process.argv[argIndex + 1] || "").trim();
function fail(message) { throw new Error("STAGING BUILD BLOCKED: " + message); }

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
if (!uuidPattern.test(uuid)) fail("Supply the new staging D1 database UUID via --database-id.");
const productionUUID = prodConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
if (!productionUUID) fail("Production binding not found; cannot verify safe isolation.");
if (uuid.toLowerCase() === productionUUID.toLowerCase()) fail("Staging database ID must differ from production.");
if (!/^name\s*=\s*"parkpulse-api-staging"/m.test(template)) fail("Worker name is not staging.");
if (!/^database_name\s*=\s*"parkpulse-staging"/m.test(template)) fail("Database name is not staging.");
if (!/^STAGING_MODE\s*=\s*"true"/m.test(template)) fail("Staging safety flag missing.");
if (!/^STAGING_ALLOW_PUSH\s*=\s*"false"/m.test(template)) fail("Push gate must be disabled.");
if (!/^STAGING_ENABLE_CRON\s*=\s*"false"/m.test(template)) fail("Cron gate must be disabled.");
if (/^\s*\[triggers\]/m.test(template) || /^\s*crons\s*=/m.test(template)) fail("Staging must not schedule cron jobs.");
if (!template.includes("__STAGING_D1_ID__")) fail("Staging D1 placeholder not found.");
if (!/^name\s*=\s*"parkpulse-api"/m.test(prodConfig)) fail("Production Worker identity changed; review before building.");

let generatedCatalog = catalog;
let changes = 0;
for (const pattern of [
  /(\b id:\s*"dlr",[^\n]*\benabled:\s*)false/,
  /(\{ id:\s*16,[^\n]*\benabled:\s*)false/,
  /(\{ id:\s*17,[^\n]*\benabled:\s*)false/
]) {
  if (!pattern.test(generatedCatalog)) fail("DLR source flag not found exactly where expected.");
  generatedCatalog = generatedCatalog.replace(pattern, (_m, prefix) => { changes++; return prefix + "true"; });
}
if (changes !== 3) fail("Expected exactly three DLR feature flags.");

const stageRoot = join(projectRoot, ".parkpulse-staging");
const workerRoot = join(stageRoot, "worker");
mkdirSync(workerRoot, { recursive: true });
mkdirSync(join(stageRoot, "assets/js"), { recursive: true });
cpSync(join(projectRoot, "worker/src"), join(workerRoot, "src"), { recursive: true, force: true });
for (const file of ["package.json", "package-lock.json", "schema.sql"]) {
  const src = join(projectRoot, "worker", file);
  if (existsSync(src)) cpSync(src, join(workerRoot, file), { force: true });
}
writeFileSync(join(stageRoot, "assets/js/catalog.js"), generatedCatalog);
const stagingConfig = template.replaceAll("__STAGING_D1_ID__", uuid);
if (stagingConfig.includes(productionUUID)) fail("Generated config references production D1.");
writeFileSync(join(workerRoot, "wrangler.toml"), stagingConfig);
console.log("Staging build created (no Cloudflare operations): .parkpulse-staging/worker/");
console.log("Worker: parkpulse-api-staging | D1: parkpulse-staging | rides: WDW + DLR");
console.log("Cron disabled; subscription endpoints gated; production source remains unchanged.");
console.log("Next: cd .parkpulse-staging/worker && npm install --no-save --package-lock=false");
console.log("      npx wrangler deploy --config ./wrangler.toml --dry-run");
