#!/usr/bin/env node
// Creates a NEW, distinct VAPID keypair for ParkPulse staging only.
// Stores the private pair in .parkpulse-staging/ (gitignored) and uploads
// the keys to parkpulse-api-staging via Wrangler. Never prints secrets.
import { createECDH } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const workerRoot = join(projectRoot, ".parkpulse-staging", "worker");
const configPath = join(workerRoot, "wrangler.toml");
const privateFile = join(projectRoot, ".parkpulse-staging", "push-vapid.json");
const prodConfig = join(projectRoot, "worker", "wrangler.toml");

function stop(message) { console.error("STAGING PUSH SETUP STOPPED: "+message); process.exit(1); }
const check = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length > 2 && !check) stop("Usage: node worker/scripts/setup-staging-push.mjs [--check]");
if (!existsSync(configPath) || !existsSync(prodConfig)) stop("Generate a staging-only Worker first.");
const cfg=readFileSync(configPath,"utf8"),prod=readFileSync(prodConfig,"utf8");
const stageDb=cfg.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
const prodDb=prod.match(/^database_id\s*=\s*"([^"]+)"/m)?.[1];
if (!stageDb || !prodDb || stageDb === prodDb ||
    !/^name\s*=\s*"parkpulse-api-staging"$/m.test(cfg) ||
    !/^database_name\s*=\s*"parkpulse-staging"$/m.test(cfg) ||
    !/^STAGING_MODE\s*=\s*"true"$/m.test(cfg) ||
    !/^STAGING_ALLOW_PUSH\s*=\s*"true"$/m.test(cfg) ||
    !/^STAGING_PUSH_TEST_ONLY\s*=\s*"true"$/m.test(cfg) ||
    !/^STAGING_HISTORY_ONLY\s*=\s*"true"$/m.test(cfg) ||
    !/^STAGING_ENABLE_CRON\s*=\s*"true"$/m.test(cfg) ||
    !/^APP_ORIGIN\s*=\s*"https:\/\/parkpulse-api-staging\.[a-z0-9-]+\.workers\.dev"$/mi.test(cfg)) {
  stop("Expected staging push-test flags, isolated D1 and staging origin are missing.");
}
if (!/\.parkpulse-staging\/?/m.test(readFileSync(join(projectRoot, ".gitignore"),"utf8"))) {
  stop("Staging secrets directory is not gitignored.");
}
if (check) {
  console.log("STAGING PUSH CONFIG OK (no secrets read, no network requests).");
  process.exit(0);
}
let keys;
if (existsSync(privateFile)) {
  try { keys=JSON.parse(readFileSync(privateFile,"utf8")); }
  catch { stop("Saved staging keys are unreadable. Refusing to regenerate silently."); }
  if (!keys || typeof keys.publicKey !== "string" || typeof keys.privateKey !== "string") {
    stop("Saved staging keys are malformed.");
  }
  const ecdh=createECDH("prime256v1");
  try { ecdh.setPrivateKey(Buffer.from(keys.privateKey,"base64url")); }
  catch { stop("Stored staging private key is invalid."); }
  if (ecdh.getPublicKey(undefined,"uncompressed").toString("base64url") !== keys.publicKey) {
    stop("Staging VAPID keypair does not match.");
  }
  console.log("Reusing saved staging-only VAPID keypair; no regeneration.");
} else {
  const key=createECDH("prime256v1"); key.generateKeys();
  keys={
    publicKey:key.getPublicKey(undefined,"uncompressed").toString("base64url"),
    privateKey:key.getPrivateKey().toString("base64url")
  };
  writeFileSync(privateFile,JSON.stringify(keys),{encoding:"utf8",mode:0o600,flag:"wx"});
  console.log("New staging-only VAPID keypair saved privately (no values printed).");
}
for (const [name,value] of [
  ["VAPID_SERVER_PUBLIC_KEY",keys.publicKey],
  ["VAPID_SERVER_PRIVATE_KEY",keys.privateKey]
]) {
  console.log("Uploading " + name + " to parkpulse-api-staging…");
  const result=spawnSync("npx",["--no-install","wrangler","secret","put",name,"--config","./wrangler.toml"],{
    cwd:workerRoot,input:value,encoding:"utf8",timeout:120000,maxBuffer:1024*1024
  });
  if (result.status !== 0) {
    // Never echo potentially sensitive Wrangler stderr or stdin.
    stop(name+" upload did not succeed. Resolve Wrangler authentication and rerun safely.");
  }
}
console.log("Staging-only push keys configured. Production keys and Worker were not touched.");
