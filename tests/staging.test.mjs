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
  const sample = source.slice(source.indexOf("async function runStagingHistoryOnly(env) {"),source.indexOf("async function runStagingBaselineBatch(env) {"));
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


test("staging preview hosts enabled DLR PWA assets from same Worker origin", () => {
  const before = read("assets/js/catalog.js");
  const cmd = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  const origin = "https://parkpulse-api-staging.jamesp5297.workers.dev";
  const r = spawnSync(process.execPath, [cmd.pathname, "--database-id", "11111111-1111-4111-8111-111111111111",
    "--enable-history-cron", "--preview-url", origin], {encoding:"utf8"});
  assert.equal(r.status,0,r.stderr);
  const config = read(".parkpulse-staging/worker/wrangler.toml");
  const index = read(".parkpulse-staging/site/index.html");
  const catalog = read(".parkpulse-staging/site/assets/js/catalog.js");
  const appConfig = read(".parkpulse-staging/site/assets/js/config.js");
  const app = read(".parkpulse-staging/site/assets/js/app.js");
  const push = read(".parkpulse-staging/site/assets/js/push.js");
  const sw = read(".parkpulse-staging/site/service-worker.js");
  const version = JSON.parse(read(".parkpulse-staging/site/version.json"));
  assert.match(config, /^\[assets\]$/m);
  assert.match(config, /^directory = "\.\.\/site"$/m);
  assert.match(config, /run_worker_first = \["\/api\/\*", "\/health", "\/vapid-key", "\/subscriptions\*"\]/);
  assert.match(config,/^crons = \["\*\/5 \* \* \* \*"\]$/m);
  assert.match(config, /APP_ORIGIN = "https:\/\/parkpulse-api-staging\.jamesp5297\.workers\.dev"/);
  assert.match(index, /Staging Preview/);
  assert.match(index, /Alerts disabled/);
  assert.match(index, /noindex,nofollow/);
  assert.match(catalog, /id: "dlr"[^\n]*enabled: true/);
  assert.match(catalog, /id: 16,[^\n]*enabled: true/);
  assert.match(appConfig, /WORKER_BASE: "https:\/\/parkpulse-api-staging\.jamesp5297\.workers\.dev"/);
  assert.doesNotMatch(appConfig,/WORKER_BASE: "https:\/\/parkpulse-api\.jamesp5297/);
  assert.match(app,/new URL\("https:\/\/parkpulse-api-staging\.jamesp5297\.workers\.dev\/"\)/);
  assert.match(push,/export function pushSupported\(\)\{return Boolean\(false && /);
  assert.match(version.version,/^2\.0\.0-preview\.\d+$/);
  assert(sw.includes(version.version));
  assert(!sw.includes('CACHE_NAME = "parkpulse-1.9.5"'));
  assert.equal(read("assets/js/catalog.js"), before);
});

test("preview generator rejects the production Worker and arbitrary origins", () => {
  const cmd = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  for (const badUrl of [
    "https://parkpulse-api.jamesp5297.workers.dev",
    "https://app.useparkpulse.com",
    "http://parkpulse-api-staging.jamesp5297.workers.dev",
    "https://parkpulse-api-staging.jamesp5297.workers.dev/unsafe"
  ]) {
    const r = spawnSync(process.execPath, [cmd.pathname, "--database-id", "11111111-1111-4111-8111-111111111111",
      "--preview-url", badUrl], {encoding:"utf8"});
    assert.notEqual(r.status,0,badUrl+" must be rejected");
    assert.match(r.stderr,/STAGING BUILD BLOCKED/);
  }
});

test("protected staging baseline route reads fresh saved rides; no extra park polling or push", async () => {
  const source = read("worker/src/index.js");
  const start = source.indexOf("async function runStagingBaselineBatch(env) {");
  const end = source.indexOf("async function runManualRefresh(env) {");
  assert(start !== -1 && end > start);
  const vm = await import("node:vm");
  const now = Date.now();
  const rows = [
    {ride_key:"dl:space-mountain",park_id:16,source_id:"tp-dl",name:"Space Mountain",source:"themeparks.wiki",updated_at:now},
    {ride_key:"mk:space-mountain",park_id:6,source_id:"tp-mk",name:"Space Mountain",source:"themeparks.wiki",updated_at:now},
    {ride_key:"old:ride",park_id:16,source_id:"old",name:"Old ride",source:"themeparks.wiki",updated_at:now-3600000},
    {ride_key:"other:ride",park_id:888,source_id:"x",name:"Wrong park",source:"themeparks.wiki",updated_at:now}
  ];
  const calls = [];
  const env = {STAGING_MODE:"true",THEMEPARKS_API_KEY:"fixture",DB:{prepare(sql){
    calls.push(sql);
    assert.match(sql,/FROM ride_state_v2/);
    return {all:async()=>({results:rows})};
  }}};
  const ctx = vm.createContext({
    Date,Number,String,
    PARKS:new Map([[6,{}],[16,{}]]),
    HISTORY_HEALTH_WINDOW_MS:20*60*1000,
    refreshRideBaselines:async (_,rides,batchSize)=>{
      assert.equal(batchSize,4);
      assert.deepEqual(Array.from(rides,ride=>ride.id),["dl:space-mountain","mk:space-mountain"]);
      return {processed:2,refreshed:2,failed:0};
    },
    getAnalyticsStatus:async()=>({totalRides:101,baselineRides:10,pendingRides:91,errorRides:0,baselineErrors:[]})
  });
  vm.runInContext(source.slice(start,end),ctx);
  const run = vm.runInContext("runStagingBaselineBatch",ctx);
  await assert.rejects(run({STAGING_MODE:"false"}),/Staging-only/);
  assert.equal((await run(env)).analytics.baselineRides,10);
  assert.equal(calls.length,1);
  const backendRoute = source.slice(source.indexOf('if (request.method === "POST" && url.pathname === "/api/admin/baselines"'),source.indexOf('if (request.method === "POST" && url.pathname === "/subscriptions"'));
  assert.match(backendRoute,/REFRESH_ADMIN_TOKEN/);
  assert.match(backendRoute,/runStagingBaselineBatch\(env\)/);
});


test("paced baseline automation checks staging safety without a token or network", () => {
  const source = read("worker/scripts/backfill-staging.mjs");
  assert.match(source, /STAGING_MODE\\s\*=\\s\*"true"/); // Source verifies STAGING_MODE.
  assert.match(source, /parkpulse-api-staging\.jamesp5297\.workers\.dev/);
  assert.match(source, /maxBatches = 26/);
  assert.match(source, /delayBetweenBatchesMs = 40_000/);
  assert.match(source, /stopController|SIGINT/);
  assert.match(source, /failed > 0 \|\| errorRides > 0/);
  assert.match(source, /historyCollecting/);
  assert.doesNotMatch(source, /https:\/\/parkpulse-api\.jamesp5297\.workers\.dev/);
  const script = new URL("../worker/scripts/backfill-staging.mjs", import.meta.url);
  const generator = new URL("../worker/scripts/build-staging.mjs", import.meta.url);
  const built = spawnSync(process.execPath, [generator.pathname, "--database-id",
    "11111111-1111-4111-8111-111111111111", "--enable-history-cron",
    "--preview-url", "https://parkpulse-api-staging.jamesp5297.workers.dev"], {encoding:"utf8"});
  assert.equal(built.status,0,built.stderr);
  const verified = spawnSync(process.execPath, [script.pathname, "--check"], {encoding:"utf8"});
  assert.equal(verified.status,0,verified.stderr);
  assert.match(verified.stdout,/STAGING BACKFILL CONFIG OK/);
  const invalid = spawnSync(process.execPath, [script.pathname, "--production"], {encoding:"utf8"});
  assert.notEqual(invalid.status,0);
  assert.match(invalid.stderr,/STAGING BACKFILL STOPPED/);
});


test("staging ThemeParks history UUID directory lookup is cached and ignores non-rides", async () => {
  const source=read("worker/src/index.js");
  const start=source.indexOf("async function stagingThemeParksRideIds(env) {");
  const end=source.indexOf("async function runStagingBaselineBatch(env) {");
  assert(start !== -1 && end > start);
  const vm=await import("node:vm");
  const id="a8a5b7e4-1234-5678-abcd-ef0123456789";
  const parkId="75ea578a-adc8-4116-a54d-dccb60765ef9";
  let persisted=null,fetches=0;
  const env={STAGING_MODE:"true",THEMEPARKS_API_KEY:"fixture",DB:{prepare(sql){
    if(sql.startsWith("SELECT"))return{bind:()=>({first:async()=>persisted})};
    assert.match(sql,/INSERT INTO worker_state/);
    return{bind:(_key,time,payload)=>({run:async()=>{persisted={updated_at:time,payload};return{}}})};
  }}};
  const ctx=vm.createContext({
    Date,Map,Object,String,RegExp,JSON,VERSION:"1.7.6",
    PARKS:new Map([[6,{themeParksId:parkId,rides:[{key:"mk:space-mountain",name:"Space Mountain"}]}]]),
    isSingleRiderName:name=>/single rider/i.test(name),
    normalizeName:name=>String(name).toLowerCase(),
    findCatalogRide:(park,name)=>park.rides.find(x=>x.name===name),
    fetch:async(url,options)=>{
      fetches++;
      assert.equal(url,"https://api.themeparks.wiki/v1/entity/"+parkId+"/children");
      assert.equal(options.headers["x-api-key"],"fixture");
      return{ok:true,json:async()=>({children:[
        {id,name:"Space Mountain",entityType:"ATTRACTION"},
        {id,name:"Space Mountain",entityType:"RESTAURANT"},
        {id,name:"Space Mountain Single Rider",entityType:"ATTRACTION"},
        {id:"371",name:"Space Mountain",entityType:"ATTRACTION"}
      ]})};
    }
  });
  vm.runInContext(source.slice(start,end),ctx);
  const resolve=vm.runInContext("stagingThemeParksRideIds",ctx);
  await assert.rejects(resolve({...env,STAGING_MODE:"false"}),/Staging-only/);
  assert.equal((await resolve(env)).get("mk:space-mountain"),id);
  assert.equal((await resolve(env)).get("mk:space-mountain"),id);
  assert.equal(fetches,1,"directory fetched once; subsequent batch uses stored mapping");
});

test("staging Queue-Times rides use resolved ThemeParks UUIDs, never numeric fallback IDs", async () => {
  const source=read("worker/src/index.js");
  const start=source.indexOf("async function runStagingBaselineBatch(env) {");
  const end=source.indexOf("async function runManualRefresh(env) {");
  const vm=await import("node:vm"),now=Date.now();
  const id="a8a5b7e4-1234-5678-abcd-ef0123456789";
  const ctx=vm.createContext({
    Date,Number,String,Map,
    PARKS:new Map([[6,{}]]),HISTORY_HEALTH_WINDOW_MS:1200000,
    stagingThemeParksRideIds:async()=>new Map([["mk:space-mountain",id]]),
    refreshRideBaselines:async(_,rides,batchSize)=>{
      assert.equal(batchSize,4);
      assert.equal(rides[0].sourceId,id);
      assert.equal(rides[0].source,"themeparks.wiki");
      assert.equal(rides[1].sourceId,null);
      assert.equal(rides[1].sourceStale,true);
      return{processed:1,refreshed:1,failed:0};
    },
    getAnalyticsStatus:async()=>({totalRides:101,baselineRides:17,pendingRides:84,errorRides:0,baselineErrors:[]})
  });
  vm.runInContext(source.slice(start,end),ctx);
  const run=vm.runInContext("runStagingBaselineBatch",ctx);
  const result=await run({STAGING_MODE:"true",THEMEPARKS_API_KEY:"fixture",DB:{prepare:()=>({all:async()=>({results:[
    {ride_key:"mk:space-mountain",park_id:6,source_id:"371",name:"Space Mountain",source:"queue-times",updated_at:now},
    {ride_key:"mk:unmapped",park_id:6,source_id:"372",name:"Unmapped",source:"queue-times",updated_at:now}
  ]})})}});
  assert.equal(result.mappedRides,1);
  assert.equal(result.unmappedRides,1);
});


test("staging opt-in test push generates enabled PWA without enabling live alerts", () => {
  const cmd=new URL("../worker/scripts/build-staging.mjs",import.meta.url);
  const url="https://parkpulse-api-staging.jamesp5297.workers.dev";
  const args=["--database-id","11111111-1111-4111-8111-111111111111",
    "--enable-history-cron","--preview-url",url,"--enable-test-push"];
  const built=spawnSync(process.execPath,[cmd.pathname,...args],{encoding:"utf8"});
  assert.equal(built.status,0,built.stderr);
  const cfg=read(".parkpulse-staging/worker/wrangler.toml");
  assert.match(cfg,/^STAGING_MODE = "true"$/m);
  assert.match(cfg,/^STAGING_ALLOW_PUSH = "true"$/m);
  assert.match(cfg,/^STAGING_PUSH_TEST_ONLY = "true"$/m);
  assert.match(cfg,/^STAGING_HISTORY_ONLY = "true"$/m);
  assert.match(cfg,/^crons = \["\*\/5 \* \* \* \*"\]$/m);
  assert.match(cfg,/^APP_ORIGIN = "https:\/\/parkpulse-api-staging\.jamesp5297\.workers\.dev"$/m);
  const push=read(".parkpulse-staging/site/assets/js/push.js");
  assert.match(push,/export function pushSupported\(\)\{return Boolean\(workerBase/);
  assert.doesNotMatch(push,/Boolean\(false && workerBase/);
  const index=read(".parkpulse-staging/site/index.html");
  assert.match(index,/Staging · Push test only/);
  assert.doesNotMatch(index,/2\.0 Staging Preview · Alerts disabled/);
  assert.match(read("assets/js/push.js"),/Boolean\(workerBase/);
  const check=new URL("../worker/scripts/setup-staging-push.mjs",import.meta.url);
  const verified=spawnSync(process.execPath,[check.pathname,"--check"],{encoding:"utf8"});
  assert.equal(verified.status,0,verified.stderr);
  assert.match(verified.stdout,/STAGING PUSH CONFIG OK/);
  assert(!verified.stdout.includes("privateKey"));
});

test("staging test-push generation requires a staging host and collector schedule", () => {
  const cmd=new URL("../worker/scripts/build-staging.mjs",import.meta.url);
  const base=["--database-id","11111111-1111-4111-8111-111111111111"];
  const origin="https://parkpulse-api-staging.jamesp5297.workers.dev";
  for(const args of [
    [...base,"--enable-test-push"],
    [...base,"--enable-test-push","--preview-url",origin],
    [...base,"--enable-test-push","--enable-history-cron"]
  ]){
    const r=spawnSync(process.execPath,[cmd.pathname,...args],{encoding:"utf8"});
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/STAGING BUILD BLOCKED/);
  }
});

test("staging notification routes require isolated VAPID keys and registered test subscribers", async () => {
  const source=read("worker/src/index.js");
  const start=source.indexOf("function stagingPushTestReady(env) {");
  const end=source.indexOf("const PARKS = new Map([",start);
  assert(start!==-1 && end>start);
  const vm=await import("node:vm");
  const fn=vm.runInNewContext(source.slice(start,end)+"\nstagingPushTestReady", {Boolean});
  const env={STAGING_MODE:"true",STAGING_ALLOW_PUSH:"true",STAGING_PUSH_TEST_ONLY:"true",
    VAPID_SUBJECT:"https://parkpulse-api-staging.example/",VAPID_SERVER_PUBLIC_KEY:"fixture",VAPID_SERVER_PRIVATE_KEY:"fixture"};
  assert.equal(fn(env),true);
  for(const change of [
    {STAGING_MODE:"false"},{STAGING_ALLOW_PUSH:"false"},{STAGING_PUSH_TEST_ONLY:"false"},
    {VAPID_SERVER_PRIVATE_KEY:null},{VAPID_SERVER_PUBLIC_KEY:null}
  ]) assert.equal(fn({...env,...change}),false);
  assert.match(source,/SELECT endpoint,p256dh,auth FROM subscriptions WHERE endpoint=\?/);
  assert.match(source,/SELECT last_sent FROM notification_log_v2 WHERE endpoint=\? AND ride_key=\? AND kind=\?/);
  assert.match(source,/STAGING_PUSH_DISABLED/);
  const staging=source.slice(source.indexOf('async scheduled(controller, env, ctx) {'),source.indexOf('\n};',source.indexOf('async scheduled(controller, env, ctx) {')));
  assert.doesNotMatch(staging,/STAGING_ALLOW_PUSH|STAGING_PUSH_TEST_ONLY/);
  assert.match(staging,/ctx\.waitUntil\(runStagingHistoryOnly\(env\)\)/);
  assert.doesNotMatch(staging.slice(0,staging.indexOf("// Production behavior is unchanged.")),
    /runRideWatch|runScheduledMaintenance/);
});
