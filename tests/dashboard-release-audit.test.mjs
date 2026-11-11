import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function functionBody(source, name) {
  const start = source.indexOf("function " + name + "(");
  assert(start >= 0, "Missing function " + name);
  const next = source.indexOf("\nfunction ", start + 10);
  return source.slice(start, next < 0 ? source.length : next);
}

test("2.1 approved dashboard and style remain exactly in sync with the hosted preview", () => {
  const app = read("assets/js/app.js");
  const preview = read("preview-2-1/assets/js/app.js");
  const shared = [
    "parkOperatingState", "closedParkReason", "parkFeatureMarkup",
    "crowdPresentation", "dashboardMetrics", "dashboardMetricsMarkup",
    "dashboardConditionMarkup",
    "renderExplore", "renderParkHours", "renderRideDataUpdate",
  ];
  for (const name of shared) {
    assert.equal(functionBody(app, name), functionBody(preview, name),
      "Dashboard drift between release candidate and accepted preview: " + name);
  }
  // Live watch titles follow the selected provider name after 2.1.0.
  assert.match(app, /function watchDisplayName\(/);
  assert.match(app, /watchDisplayName\(rule, ride\)/);
  assert.equal(read("assets/css/app.css"), read("preview-2-1/assets/css/app.css"),
    "Release CSS must match the approved preview before versioning");
});

test("2.1 keeps existing watch and preference keys, and normal push functionality", () => {
  const store = read("assets/js/store.js");
  const api = read("assets/js/api.js");
  const push = read("assets/js/push.js");
  const app = read("assets/js/app.js");

  assert.match(store, /const KEY = "parkpulse\.rideWatcher\.v1"/);
  assert.match(api, /parkpulse\.lastGoodRides\.v1/);
  assert.match(push, /export async function (enablePush|syncRules|disablePush)\(/);
  assert.match(push, /\/subscriptions/);
  assert.doesNotMatch(push, /Push testing is disabled in preview/);
  assert.match(app, /serviceWorker\.register\("\.\/service-worker\.js"\)/);
  assert.match(app, /function safeSync\(/);
  assert.doesNotMatch(app, /false && "serviceWorker" in navigator/);
});

test("2.0 saved watches, favorites and resort selection survive 2.1 dashboard migration", () => {
  const liveExpiry = Date.now() + 24 * 3600 * 1000;
  const oldState = {
    selectedParkId: 17, selectedResortId: "dlr",
    lastParkByResort: { wdw: 5, dlr: 17 },
    activeView: "explore", sort: "wait", theme: "dark", accent: "pink",
    favorites: ["dca:favorite", "dl:favorite"],
    rules: [
      { rideId: "dca:favorite", parkId: 17, rideName: "Favorite Ride", reopen: true, threshold: 35, expiresAt: liveExpiry },
      { rideId: "mk:watched", parkId: 6, rideName: "Watched Ride", reopen: true, threshold: null, expiresAt: null },
    ],
  };
  const storage = new Map([["parkpulse.rideWatcher.v1", JSON.stringify(oldState)]]);
  const PARKS = [6, 5, 16, 17].map(id => ({
    id, resortId: id === 16 || id === 17 ? "dlr" : "wdw",
  }));
  const RESORTS = [{id:"wdw",enabled:true},{id:"dlr",enabled:true}];
  const ctx = vm.createContext({
    window: { PARKPULSE_CONFIG: { DEFAULT_PARK_ID: 6 } },
    localStorage: {
      getItem:key => storage.get(key) ?? null,
      setItem:(key,value) => storage.set(key,String(value)),
    },
    PARKS, RESORTS,
    parksForResort:id => PARKS.filter(p => p.resortId === id),
    resortForPark:id => RESORTS.find(r => r.id === PARKS.find(p => p.id === Number(id))?.resortId),
    EventTarget, CustomEvent, structuredClone, Date,
  });
  const source = read("assets/js/store.js")
    .replace(/^import [^\n]*\n/gm, "")
    .replace(/^export /gm, "") + "\nglobalThis.ReleaseStore = Store;";
  vm.runInContext(source, ctx);
  const saved = new ctx.ReleaseStore();
  assert.equal(saved.snapshot.selectedResortId, "dlr");
  assert.equal(saved.snapshot.selectedParkId, 17);
  assert.equal(saved.snapshot.lastParkByResort.wdw, 5);
  assert.deepEqual([...saved.snapshot.favorites], oldState.favorites);
  assert.deepEqual(saved.snapshot.rules.map(x => x.rideId), oldState.rules.map(x => x.rideId));
  assert.equal(saved.snapshot.rules[0].threshold, 35);
  assert.equal(saved.snapshot.rules[0].expiresAt, liveExpiry);
  assert.equal(saved.snapshot.dashboard.density, "compact");
  assert.equal(saved.snapshot.dashboard.showWorth, true);
  assert.equal(saved.snapshot.dashboard.showWatches, true);
  assert.equal(saved.snapshot.dashboard.showCrowd, true);
  assert.equal(saved.snapshot.dashboard.showHours, false);
  saved.update(s => {s.dashboard.showCrowd = false;s.dashboard.density = "comfortable";}, "dashboard");
  const loaded = new ctx.ReleaseStore();
  assert.equal(loaded.snapshot.dashboard.showCrowd, false);
  assert.equal(loaded.snapshot.dashboard.density, "comfortable");
  assert.deepEqual(loaded.snapshot.rules.map(x => x.rideId), oldState.rules.map(x => x.rideId));
  assert.deepEqual([...loaded.snapshot.favorites], oldState.favorites);
  assert.equal(loaded.snapshot.selectedParkId, 17);
  assert.equal(loaded.snapshot.accent, "pink");
});
