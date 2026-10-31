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
  assert.match(template, /^\[observability\]$/m);
  assert.match(template, /^\[observability.logs\]$/m);
  assert.match(template, /^invocation_logs = true$/m);
  assert.match(template, /^head_sampling_rate = 1$/m);
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
  const sample = source.slice(source.indexOf("async function runStagingHistoryOnly(env) {"),source.indexOf("// One-shot staging scheduled integration drill."));
  assert.match(sample,/await fetchCurrentRideSnapshot\(env\)/);
  assert.match(sample,/await writeCurrentRideSnapshot\(env, rides\)/);
  assert.doesNotMatch(sample,/runRideWatch|sendPush|enqueueRideAlerts|refreshRideBaselines/);
  const vm = await import("node:vm");
  let fetched = 0,written = 0;
  const ctx = vm.createContext({
    console,
    fetchCurrentRideSnapshot: async () => {fetched++;return {rides:[{id:"dl:test"}]};},
    writeCurrentRideSnapshot: async (_, rows) => {written++;assert.equal(rows.length,1);},
    stagingPushTestReady: () => false,
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
  const releaseVersion = JSON.parse(read("version.json")).version;
  assert(!sw.includes('CACHE_NAME = "parkpulse-' + releaseVersion + '"'));
  assert(!app.includes('?v=' + releaseVersion));
  assert(index.includes(version.version));
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


test("wait target and reopening simulations use the exact production evaluator", async () => {
  const source=read("worker/src/index.js");
  const from=source.indexOf("function evaluateRideTransitionAlert(");
  const to=source.indexOf("async function runRideWatch(env) {",from);
  assert(from!==-1 && to>from);
  const vm=await import("node:vm");
  const now=Date.now();
  const ctx={Number,Date,encodeURIComponent,
    LIVE_FRESHNESS_MS:15*60000,
    PARKS:new Map([[16,{name:"Disneyland Park"}]]),
    notificationRideName:r=>r.name,safeTag:t=>t.replace(/[^a-z0-9_-]/gi,"-")};
  const evaluateAlert=vm.runInNewContext(source.slice(from,to)+"\nevaluateRideTransitionAlert",ctx);
  const ride={id:"dl:indiana-jones",parkId:16,name:"Indiana Jones Adventure",
    isOpen:true,waitTime:35,sourceStale:false,sourceMissing:false};
  const rule={rideId:ride.id,threshold:35,reopen:true};
  const full={operationalBefore:true,operationalNow:true,openingRamp:false};
  const appUrl="https://parkpulse-api-staging.jamesp5297.workers.dev/";
  const wait=evaluateAlert(ride,{isOpen:true,waitTime:50,updatedAt:now-60000},
    rule,full,now,appUrl);
  assert.equal(wait.kind,"wait");
  assert.equal(wait.threshold,35);
  assert.match(wait.payload.title,/Indiana Jones Adventure.*35 min/);
  assert.equal(wait.payload.url,appUrl+"?ride=dl%3Aindiana-jones");
  const reopen=evaluateAlert(ride,{isOpen:false,waitTime:null,updatedAt:now-60000},
    rule,full,now,appUrl);
  assert.equal(reopen.kind,"reopen");
  assert.match(reopen.payload.title,/reopened/);
  assert.equal(reopen.payload.url,wait.payload.url);
  assert.equal(evaluateAlert({...ride,sourceStale:true},{isOpen:false,updatedAt:now-60000},
    rule,full,now,appUrl),null);
  assert.equal(evaluateAlert(ride,{isOpen:false,updatedAt:now-60000},rule,
    {...full,openingRamp:true},now,appUrl),null);
  assert.equal(evaluateAlert(ride,{isOpen:true,waitTime:35,updatedAt:now-60000},
    rule,full,now,appUrl),null);
  assert.equal(evaluateAlert(ride,{isOpen:true,waitTime:50,updatedAt:now-16*60000},
    rule,full,now,appUrl),null);
  assert.equal(evaluateAlert(ride,{isOpen:true,waitTime:50,updatedAt:now-60000},
    {...rule,threshold:null},full,now,appUrl),null);
  const production=source.slice(source.indexOf("async function runRideWatch(env) {"),
    source.indexOf("async function getAnalyticsStatus(env) {"));
  assert.match(production,/evaluateRideTransitionAlert\(/);
});

test("simulated staging endpoint is scoped to the registering device and cannot write live checkpoints",async()=>{
  const source=read("worker/src/index.js");
  const start=source.indexOf('if (request.method === "POST" && url.pathname === "/subscriptions/test-alert")');
  const end=source.indexOf('if (request.method === "POST" && url.pathname === "/subscriptions/test")',start);
  assert(start!==-1&&end>start);
  const vm=await import("node:vm");
  const now=Date.now();
  const rule={rideId:"dl:indiana-jones",parkId:16,rideName:"Indiana Jones Adventure",threshold:35,reopen:true};
  const registered={endpoint:"https://push.example/abc",p256dh:"device-p256dh",auth:"device-auth",
    watch_ids:JSON.stringify([rule])};
  const sub={endpoint:registered.endpoint,keys:{p256dh:registered.p256dh,auth:registered.auth}};
  let delivery=null,lastSent=null,writeCount=0;
  const env={STAGING_MODE:"true",APP_URL:"https://parkpulse-api-staging.jamesp5297.workers.dev/",DB:{
    prepare(sql){
      if(sql.includes("FROM subscriptions"))return{bind:()=>({first:async()=>registered})};
      if(sql.includes("SELECT last_sent"))return{bind:()=>({first:async()=>lastSent==null?null:{last_sent:lastSent}})};
      if(sql.includes("INSERT INTO notification_log_v2"))return{bind:()=>({run:async()=>{writeCount++;lastSent=Date.now();return{}}})};
      throw Error("Unexpected staging DB operation: "+sql);
    }
  }};
  const sharedStart=source.indexOf("function evaluateRideTransitionAlert(");
  const sharedEnd=source.indexOf("async function runRideWatch(env) {",sharedStart);
  const ctx=vm.createContext({Date,Number,String,Boolean,Array,JSON,URL,encodeURIComponent,
    LIVE_FRESHNESS_MS:900000,
    PARKS:new Map([[16,{name:"Disneyland Park"}]]),
    notificationRideName:r=>r.name,safeTag:id=>id.replace(/[^a-z0-9_-]+/gi,"-"),
    stagingPushTestReady:env=>env.STAGING_MODE==="true",
    validateSubscription:sub=>sub?.endpoint&&sub?.keys?.p256dh&&sub?.keys?.auth
      ? {endpoint:sub.endpoint,p256dh:sub.keys.p256dh,auth:sub.keys.auth}:null,
    normalizeRules:raw=>raw,
    catalogRideByKey:key=>key===rule.rideId?{name:"Indiana Jones Adventure",parkId:16}:null,
    sendPush:async(_,payload)=>{delivery=payload;return true;},
    json:(value,status)=>({status,value}),
    console
  });
  vm.runInContext(source.slice(sharedStart,sharedEnd),ctx);
  const handler=vm.runInContext(
    "(async(request,env)=>{const url=new URL(request.url);const cors={};"+
      source.slice(start,end)+"return {status:404};})",ctx);
  const req=(kind,subscription=sub,rideId=rule.rideId)=>({
    method:"POST",url:"https://parkpulse-api-staging.jamesp5297.workers.dev/subscriptions/test-alert",
    json:async()=>({kind,subscription,rideId})
  });
  assert.equal((await handler(req("wait"),{...env,STAGING_MODE:"false"})).status,404);
  assert.equal((await handler(req("fake"),env)).status,400);
  assert.equal((await handler(req("wait",{...sub,keys:{...sub.keys,auth:"wrong"}}),env)).status,403);
  assert.equal(writeCount,0);
  const wait=await handler(req("wait"),env);
  assert.equal(wait.status,200);
  assert.equal(wait.value.simulated,true);
  assert.equal(wait.value.kind,"wait");
  assert.equal(writeCount,1);
  assert.match(delivery.title,/^TEST · Indiana Jones Adventure/);
  assert.match(delivery.body,/^Simulation only · /);
  assert.equal(delivery.url,env.APP_URL+"?ride=dl%3Aindiana-jones");
  assert.equal((await handler(req("reopen"),env)).status,429);
  lastSent=null;
  const reopen=await handler(req("reopen"),env);
  assert.equal(reopen.status,200);
  assert.match(delivery.title,/reopened/);
  assert.equal(delivery.url,env.APP_URL+"?ride=dl%3Aindiana-jones");
  assert.equal(writeCount,2);
  assert.doesNotMatch(source.slice(start,end),
    /INSERT (?:INTO|OR REPLACE INTO) (?:notification_ride_state|ride_history)/);
  assert.doesNotMatch(source.slice(start,end),/enqueueRideAlerts\(|runRideWatch\(/);
});

test("simulated alert buttons are visible only with staged push and saved watch rules",()=>{
  const app=read("assets/js/app.js"),push=read("assets/js/push.js");
  assert.match(app,/backendState\?\.stagingPushTestOnly === true/);
  assert.match(app,/state\.rules\.find\(\(rule\) => rule\.threshold != null\)/);
  assert.match(app,/state\.rules\.find\(\(rule\) => rule\.reopen === true\)/);
  assert.match(app,/data-simulate-alert="wait"/);
  assert.match(app,/data-simulate-alert="reopen"/);
  assert.match(app,/async function testStagingRideAlert/);
  assert.match(push,/export async function simulateStagingRideAlert/);
  assert.match(push,/subscriptions\/test-alert/);
  assert.match(push,/Test already sent! Try again in a minute/);
});


test("scheduled staging queue probe is one-shot and checkpoints only after queue commit", async () => {
  const src=read("worker/src/index.js");
  const start=src.indexOf("async function runArmedStagingCronProbe(env) {");
  const end=src.indexOf("// Resolve ThemeParks IDs from the park's stable entity catalog",start);
  assert(start!==-1 && end>start);
  const vm=await import("node:vm");
  const now=Date.now(),rideId="dl:indiana-jones",endpoint="https://push.example/staging-only";
  let value=JSON.stringify({status:"armed",endpoint,rideId,kind:"wait",armedAt:now,expiresAt:now+20*60000});
  const order=[],records=[];
  const env={
    STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"true",
    STAGING_ALLOW_PUSH:"true",STAGING_PUSH_TEST_ONLY:"true",
    APP_URL:"https://parkpulse-api-staging.jamesp5297.workers.dev/",
    DB:{prepare(sql){
      const fields=[];
      return {bind(...args){
        fields.push(...args);
        return {
          first:async()=>{
            if(sql.includes("FROM worker_state"))return {payload:value};
            if(sql.includes("FROM subscriptions"))return {
              endpoint,p256dh:"device-key",auth:"auth-key",watch_ids:JSON.stringify([
                {rideId,parkId:16,rideName:"Indiana Jones Adventure",reopen:true,threshold:35}
              ])};
            throw Error("unexpected SELECT "+sql);
          },
          run:async()=>{
            if(!sql.includes("UPDATE worker_state"))throw Error("unexpected UPDATE "+sql);
            const next=fields[1],expected=fields[3];
            if(value!==expected)return {meta:{changes:0}};
            value=next;
            order.push("state:"+JSON.parse(next).status);
            return {meta:{changes:1}};
          }
        };
      }};
    }}
  };
  const ctx=vm.createContext({
    Date,Number,String,Map,Object,JSON,console,
    stagingPushTestReady:()=>true,
    ensureNotificationSchema:async()=>{order.push("schema");},
    catalogRideByKey:()=>({parkId:16,name:"Indiana Jones Adventure"}),
    normalizeRules:rules=>rules,
    PARKS:new Map([[16,{name:"Disneyland Park"}]]),
    notificationRideName:r=>r.name,
    safeTag:x=>x.replace(/[^a-z0-9_-]+/gi,"-"),
    LIVE_FRESHNESS_MS:15*60000,
    encodeURIComponent,
    evaluateRideTransitionAlert:()=>({
      kind:"wait",threshold:35,payload:{title:"Indiana Jones Adventure • 35 min",
        body:"Target ≤35 • Disneyland Park",url:env.APP_URL+"?ride=dl%3Aindiana-jones",tag:"ride-test"}
    }),
    ruleMatchesRide:(rule,ride)=>rule.rideId===ride.id,
    enqueueRideAlerts:async(_env,alerts)=>{
      order.push("enqueue");records.push(alerts[0]);
      assert.match(alerts[0].payload.title,/^STAGING CRON TEST/);
      assert.match(alerts[0].payload.body,/^Simulation only/);
      return 1;
    },
    writeCurrentRideSnapshot:async(_env,rides,checkpoint)=>{
      assert.equal(checkpoint,true);
      assert.equal(rides.length,1);
      order.push("checkpoint");
    },
    processPendingRideAlerts:async(_env,config)=>{
      assert.equal(config.rides[0].id,rideId);
      assert.equal(config.subscriptions[0].endpoint,endpoint);
      assert.equal(typeof config.send,"function");
      order.push("delivery");
      return {delivered:1,retried:0,failed:0,discarded:0,pending:0};
    },
    cooldownActive:async()=>false,sendPush:async()=>true
  });
  vm.runInContext(src.slice(start,end),ctx);
  const run=vm.runInContext("runArmedStagingCronProbe",ctx);
  await run({...env,STAGING_MODE:"false"});
  assert.deepEqual(order,[]);
  await run(env);
  assert.deepEqual(order.slice(0,5),["state:running","schema","enqueue","checkpoint","delivery"]);
  assert.equal(JSON.parse(value).status,"delivered");
  assert.equal(records.length,1);
  await run(env);
  assert.equal(records.length,1,"later cron never repeats the delivered push");
});

test("staging cron probe arm API requires a registered subscribed watch and explicit confirmation",async()=>{
  const src=read("worker/src/index.js");
  const start=src.indexOf('if (request.method === "POST" && url.pathname === "/subscriptions/cron-probe")');
  const end=src.indexOf("// Simulated watch transitions use the SAME evaluator",start);
  assert(start!==-1 && end>start);
  const vm=await import("node:vm"),now=Date.now();
  const rideId="dl:indiana-jones",endpoint="https://push.example/staging";
  const sub={endpoint,keys:{p256dh:"p256dh",auth:"auth"}};
  let payload=null;
  const env={
    STAGING_MODE:"true",STAGING_ENABLE_CRON:"true",STAGING_HISTORY_ONLY:"true",
    DB:{prepare(sql){
      const bound=[];
      return{bind(...args){bound.push(...args);return{
        first:async()=>{
          if(sql.includes("FROM subscriptions"))return {
            endpoint,p256dh:"p256dh",auth:"auth",
            watch_ids:JSON.stringify([{rideId,threshold:35,parkId:16,reopen:true}])
          };
          if(sql.includes("FROM worker_state"))return payload?{payload,updated_at:now}:null;
          throw Error("unknown read "+sql);
        },
        run:async()=>{
          if(!sql.includes("INSERT INTO worker_state"))throw Error("unknown write");
          payload=bound[2];return {meta:{changes:1}};
        }
      }}};
    }}
  };
  const ctx=vm.createContext({
    JSON,Date,Number,String,URL,
    stagingPushTestReady:()=>true,
    validateSubscription:s=>s?.keys?{endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth}:null,
    normalizeRules:raw=>raw,
    catalogRideByKey:id=>id===rideId?{name:"Indiana Jones Adventure",parkId:16}:null,
    json:(body,status)=>({body,status})
  });
  const fn=vm.runInContext("(async(request,env)=>{const url=new URL(request.url);const cors={};"+
    src.slice(start,end)+"return {status:404};})",ctx);
  function req(extra={}){return{method:"POST",url:"https://parkpulse-api-staging.jamesp5297.workers.dev/subscriptions/cron-probe",
    json:async()=>({subscription:sub,kind:"wait",rideId,confirm:true,...extra})};}
  assert.equal((await fn(req(),{...env,STAGING_MODE:"false"})).status,404);
  assert.equal((await fn(req({confirm:false}),env)).status,400);
  assert.equal((await fn(req({subscription:{...sub,keys:{...sub.keys,auth:"bad"}}}),env)).status,403);
  assert.equal(payload,null);
  const armed=await fn(req(),env);
  assert.equal(armed.status,200);
  assert.equal(armed.body.armed,true);
  assert.equal(JSON.parse(payload).status,"armed");
  assert.equal((await fn(req(),env)).status,409,"cannot overwrite pending test");
});

test("staging schedule probe never enables the regular live alert job",()=>{
  const source=read("worker/src/index.js");
  const scheduled=source.slice(source.indexOf("  async scheduled(controller, env, ctx) {"),
    source.indexOf("\n};",source.indexOf("  async scheduled(controller, env, ctx) {")));
  assert.match(scheduled,/runStagingHistoryOnly\(env\)/);
  assert.doesNotMatch(scheduled.slice(0,scheduled.indexOf("// Production behavior is unchanged.")),
    /runRideWatch\(|runScheduledMaintenance\(/);
  const frontend=read("assets/js/app.js");
  assert.match(frontend,/stagingCronProbeAvailable === true/);
  assert.match(frontend,/data-arm-cron-probe/);
  assert.match(read("assets/js/push.js"),/export async function armStagingCronProbe/);
});
