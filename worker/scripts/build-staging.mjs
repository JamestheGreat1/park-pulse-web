#!/usr/bin/env node
// Build a staging-only copy. Does not authenticate or deploy anything.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const prodConfig = readFileSync(join(projectRoot, "worker/wrangler.toml"), "utf8");
const template = readFileSync(join(projectRoot, "worker/wrangler.staging.toml.template"), "utf8");
const catalog = readFileSync(join(projectRoot, "assets/js/catalog.js"), "utf8");
const argIndex = process.argv.indexOf("--database-id");
const uuid = argIndex < 0 ? "" : String(process.argv[argIndex + 1] || "").trim();
const enableHistoryCron = process.argv.includes("--enable-history-cron");
const enableTestPush = process.argv.includes("--enable-test-push");
const previewIndex = process.argv.indexOf("--preview-url");
const previewUrl = previewIndex < 0 ? "" : String(process.argv[previewIndex + 1] || "").trim();
function fail(message) { throw new Error("STAGING BUILD BLOCKED: " + message); }

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
if (!uuidPattern.test(uuid)) fail("Supply the new staging D1 database UUID via --database-id.");
const productionUUID = prodConfig.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
if (!productionUUID) fail("Production binding not found; cannot verify safe isolation.");
if (uuid.toLowerCase() === productionUUID.toLowerCase()) fail("Staging database ID must differ from production.");
if (!/^name\s*=\s*"parkpulse-api-staging"/m.test(template)) fail("Worker name is not staging.");
if (!/^database_name\s*=\s*"parkpulse-staging"/m.test(template)) fail("Database name is not staging.");
if (!/^STAGING_MODE\s*=\s*"true"/m.test(template)) fail("Staging safety flag missing.");
if (!/^STAGING_ALLOW_PUSH\s*=\s*"false"/m.test(template) ||
    !/^STAGING_PUSH_TEST_ONLY\s*=\s*"false"/m.test(template)) {
  fail("Staging push must be disabled in the committed template.");
}
if (!/^STAGING_ENABLE_CRON\s*=\s*"false"/m.test(template)) fail("Cron gate must be disabled.");
if ((template.match(/^\[triggers\]$/gm) || []).length !== 1 ||
    (template.match(/^crons = \[\]$/gm) || []).length !== 1) {
  fail("Staging must have an explicit empty trigger list by default.");
}
if (!template.includes("__STAGING_D1_ID__")) fail("Staging D1 placeholder not found.");
if (enableHistoryCron && !template.includes('STAGING_HISTORY_ONLY = "false"')) {
  fail("History-only guard missing from template.");
}
if (!/^name\s*=\s*"parkpulse-api"/m.test(prodConfig)) fail("Production Worker identity changed; review before building.");
if (enableTestPush && (!previewUrl || !enableHistoryCron)) {
  fail("Staging push tests require a staging preview origin and history-only cron.");
}
if (previewUrl) {
  let parsed;
  try { parsed = new URL(previewUrl); } catch { fail("Preview URL must be a full HTTPS workers.dev URL."); }
  if (parsed.protocol !== "https:" ||
      !/^parkpulse-api-staging\.[a-z0-9-]+\.workers\.dev$/i.test(parsed.hostname) ||
      parsed.pathname !== "/" || parsed.search || parsed.hash ||
      parsed.username || parsed.password) {
    fail("Preview URL must be the staging Worker workers.dev origin only.");
  }
}

let generatedCatalog = catalog;
let changes = 0;
for (const pattern of [
  /(\{ id:\s*"dlr",[^\n]*\benabled:\s*)false/,
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
let stagingConfig = template.replaceAll("__STAGING_D1_ID__", uuid);
if (enableHistoryCron) {
  // Opt-in trigger only; no alert cron and no hourly maintenance.
  stagingConfig = stagingConfig
    .replace('STAGING_ENABLE_CRON = "false"', 'STAGING_ENABLE_CRON = "true"')
    .replace('STAGING_HISTORY_ONLY = "false"', 'STAGING_HISTORY_ONLY = "true"');
  if (!stagingConfig.includes('STAGING_HISTORY_ONLY = "true"')) {
    fail("History-only guard was not activated.");
  }
  stagingConfig = stagingConfig.replace('crons = []', 'crons = ["*/5 * * * *"]');
  if (!stagingConfig.includes('crons = ["*/5 * * * *"]')) {
    fail("History-only schedule was not activated.");
  }
}
if (enableTestPush) {
  // Only the explicitly generated staging copy may register push subscriptions.
  // Automatic ride alert delivery remains disabled by the scheduled handler.
  stagingConfig = stagingConfig
    .replace('STAGING_ALLOW_PUSH = "false"', 'STAGING_ALLOW_PUSH = "true"')
    .replace('STAGING_PUSH_TEST_ONLY = "false"', 'STAGING_PUSH_TEST_ONLY = "true"');
  if (!stagingConfig.includes('STAGING_PUSH_TEST_ONLY = "true"')) {
    fail("Staging push test guard not activated.");
  }
}
if (previewUrl) {
  const origin = new URL(previewUrl).origin;
  stagingConfig = stagingConfig
    .replaceAll("https://parkpulse-staging.invalid/", origin + "/")
    .replaceAll("https://parkpulse-staging.invalid", origin);
  stagingConfig += String.fromCharCode(10) + '[assets]' + String.fromCharCode(10)
    + 'directory = "../site"' + String.fromCharCode(10)
    + 'binding = "ASSETS"' + String.fromCharCode(10)
    + 'run_worker_first = ["/api/*", "/health", "/vapid-key", "/subscriptions*"]'
    + String.fromCharCode(10);
  const siteRoot = join(stageRoot, "site");
  mkdirSync(join(siteRoot, "assets"), { recursive: true });
  for (const name of ["index.html", "manifest.webmanifest", "service-worker.js", "version.json"]) {
    cpSync(join(projectRoot, name), join(siteRoot, name), { force: true });
  }
  cpSync(join(projectRoot, "assets"), join(siteRoot, "assets"), { recursive: true, force: true });
  writeFileSync(join(siteRoot, "assets/js/catalog.js"), generatedCatalog);
  const previewVersion = "2.0.0-preview." + Date.now();
  function transformSite(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) { transformSite(file); continue; }
      if (!/\.(?:html|js|json|css|webmanifest)$/.test(entry.name)) continue;
      let contents = readFileSync(file, "utf8").replaceAll("1.9.5", previewVersion);
      if (entry.name === "config.js") {
        const productionBackend = "https://parkpulse-api.jamesp5297.workers.dev";
        if (!contents.includes(productionBackend)) fail("Preview API config did not contain expected production backend.");
        contents = contents.replace(productionBackend, origin);
      }
      if (entry.name === "app.js") {
        contents = contents.replace('new URL("https://app.useparkpulse.com/")', 'new URL("' + origin + '/")');
      }
      if (entry.name === "push.js") {
        const supportCheck = 'export function pushSupported(){return Boolean(';
        if (!contents.includes(supportCheck)) fail("Staging push support guard missing.");
        contents = contents.replace(
          supportCheck,
          'export function pushSupported(){return Boolean(' + (enableTestPush ? '' : 'false && ')
        );
      }
      if (entry.name === "index.html") {
        contents = contents
          .replace("<title>ParkPulse</title>", '<title>ParkPulse 2.0 — Staging Preview</title>')
          .replace("<head>", '<head>\n  <meta name="robots" content="noindex,nofollow">')
          .replace('<span class="brand-kicker">Ride watcher</span>',
            '<span class="brand-kicker">' +
            (enableTestPush ? '2.0 Staging · Push test only' : '2.0 Staging Preview · Alerts disabled') +
            '</span>');
      }
      if (entry.name === "version.json") {
        contents = JSON.stringify({ version: previewVersion, channel: "preview", released: new Date().toISOString().slice(0, 10) }, null, 2);
      }
      writeFileSync(file, contents);
    }
  }
  transformSite(siteRoot);
}
if (stagingConfig.includes(productionUUID)) fail("Generated config references production D1.");
writeFileSync(join(workerRoot, "wrangler.toml"), stagingConfig);
console.log("Staging build created (no Cloudflare operations): .parkpulse-staging/worker/");
console.log("Worker: parkpulse-api-staging | D1: parkpulse-staging | rides: WDW + DLR");
if (previewUrl) console.log("Preview: " + previewUrl +
  (enableTestPush ? " (test push enabled; automatic alerts disabled)" : " (alerts disabled)"));
console.log(enableHistoryCron
  ? "History-only cron enabled (every 5m); " +
    (enableTestPush ? "device-only push testing on; live ride alerts off." : "notifications disabled; production unchanged.")
  : "Cron disabled; subscription endpoints gated; production source remains unchanged.");
console.log("Next: cd .parkpulse-staging/worker && npm install --no-save --package-lock=false");
console.log("      npx wrangler deploy --config ./wrangler.toml --dry-run");
