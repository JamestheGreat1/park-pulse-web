import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const release = JSON.parse(source("version.json"));
const version = release.version;

test("candidate version and cache references stay synchronized", () => {
  assert.equal(version, "2.0.0");
  assert.equal(release.channel, "stable");
  const index = source("index.html");
  const app = source("assets/js/app.js");
  const sw = source("service-worker.js");
  const worker = source("worker/src/index.js");
  assert(index.includes("app.js?v=" + version));
  assert(index.includes("app.css?v=" + version));
  assert(app.includes('const APP_VERSION = "' + version + '"'));
  assert(sw.includes('const VERSION = "' + version + '"'));
  assert(sw.includes('CACHE_NAME = "parkpulse-' + version + '"'));
  // Worker-only maintenance patches deliberately do not change the PWA
  // service-worker cache, install prompt, or public frontend version.
  const backendVersion = JSON.parse(source("worker/package.json")).version;
  assert.equal(backendVersion, "2.0.1");
  assert(worker.includes('const VERSION = "' + backendVersion + '"'));
  for (const path of ["assets/js/app.js", "assets/js/api.js", "assets/js/data.js",
                      "assets/js/store.js", "assets/js/push.js"]) {
    const code = source(path);
    assert(!code.includes("?v=1.9.5"), path + " still loads old modules");
    const imports = [...code.matchAll(/\.js\?v=([a-zA-Z0-9.-]+)/g)];
    assert(imports.every((match) => match[1] === version), path + " has a mismatched import version");
  }
});

test("stable release prepares all six parks without changing production deployment targets", () => {
  const catalog = source("assets/js/catalog.js");
  for (const identity of ['id: "dlr"', "id: 16,", "id: 17,"]) {
    const line = catalog.split("\n").find((row) => row.includes(identity));
    assert(line && line.includes("enabled: true"), identity + " must be enabled in stable build");
  }
  const config = source("worker/wrangler.toml");
  assert.match(config, /^name = "parkpulse-api"$/m);
  assert.match(config, /^database_name = "parkpulse"$/m);
  assert.doesNotMatch(config, /^STAGING_MODE = "true"$/m);
  const staging = source("worker/wrangler.staging.toml.template");
  assert.match(staging, /^name = "parkpulse-api-staging"$/m);
  assert.match(staging, /^STAGING_MODE = "true"$/m);
  assert.match(staging, /^STAGING_ALLOW_PUSH = "false"$/m);
  assert.match(staging, /^STAGING_ENABLE_CRON = "false"$/m);
  assert.match(staging, /^crons = \[\]$/m);
});

test("staging preview rewrites current release version rather than a stale hardcode", () => {
  const script = source("worker/scripts/build-staging.mjs");
  assert(script.includes('readFileSync(join(projectRoot, "version.json"), "utf8")'));
  assert(script.includes("replaceAll(sourceVersion, previewVersion)"));
  assert(!script.includes('replaceAll("1.9.5", previewVersion)'));
});
