import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const worker = fs.readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
function section(start, end) { return worker.slice(worker.indexOf(start), worker.indexOf(end)); }
const watcher = section('async function runRideWatch(', 'function catalogRideByKey(');
async function evaluate(beforeWait, currentWait) {
  const ride = { id: 'mk:test', parkId: 6, isOpen: true, waitTime: currentWait };
  const sent = [];
  const checkpoints = [];
  const sub = { endpoint: 'test', watch_ids: JSON.stringify([{ rideId: ride.id, threshold: 40, reopen: false }]) };
  const context = vm.createContext({
    Date, Intl, Map, JSON, Number, console, LIVE_FRESHNESS_MS: 1200000,
    PARKS: new Map([[6, { name: 'Magic Kingdom' }]]),
    readPriorRideState: async () => [{ ...ride, waitTime: beforeWait, updatedAt: Date.now() }],
    fetchCurrentRideSnapshot: async () => ({ rides: [ride] }),
    groupByPark: rows => new Map([[6, rows]]), normalizeRules: x => x,
    ruleMatchesRide: () => true, notificationRideName: () => 'Test', safeTag: x => x,
    cooldownActive: async () => false, sendPush: async (_, payload) => { sent.push(payload); return true; },
    markNotification: async () => {},
    writeCurrentRideSnapshot: async (_, rows, checkpoint = false) => checkpoints.push(checkpoint),
    env: { DB: { prepare: () => ({ all: async () => ({ results: [sub] }), bind: () => ({ run: async () => {} }) }) } }
  });
  await vm.runInContext(watcher + ';runRideWatch(env)', context);
  return { sent, checkpoints };
}
test('unknown waits never trigger threshold notifications; numeric zero is valid', async () => {
  assert.equal((await evaluate(60, null)).sent.length, 0);
  assert.equal((await evaluate(null, 30)).sent.length, 0);
  assert.equal((await evaluate(60, 30)).sent.length, 1);
  assert.equal((await evaluate(60, 0)).sent.length, 1);
  assert.deepEqual((await evaluate(60, 30)).checkpoints, [false, true]);
});
test('manual refresh never advances the notification checkpoint', async () => {
  const calls = [];
  const context = vm.createContext({
    Date, PARKS: new Map([[6, {}]]),
    fetchCurrentRideSnapshot: async () => ({ rides: [], primaryParks: 1, fallbackParks: 0 }),
    writeCurrentRideSnapshot: async (...args) => calls.push(args),
    getAnalyticsStatus: async () => ({}), env: {}
  });
  await vm.runInContext(section('async function runManualRefresh(', 'async function runRideWatch(') + ';runManualRefresh(env)', context);
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0][2], true);
});
test('failed key rotation rejects instead of returning the dead subscription', async () => {
  let unsubscribed = false;
  const old = { options: { applicationServerKey: new Uint8Array([1]) }, unsubscribe: async () => { unsubscribed = true; return true; } };
  const context = vm.createContext({
    workerBase: 'https://example.invalid', Notification: { permission: 'granted' },
    window: { PushManager: {}, Notification: {} },
    navigator: { serviceWorker: { ready: Promise.resolve({ pushManager: {
      getSubscription: async () => old, subscribe: async () => { throw Error('provider failure'); }
    } }) } },
    fetch: async () => ({ ok: true, json: async () => ({ publicKey: 'Ag' }) }),
    AbortController, setTimeout, clearTimeout, Uint8Array, atob, btoa
  });
  const push = fs.readFileSync(new URL('../assets/js/push.js', import.meta.url), 'utf8').replace(/^import .*\n/, '').replaceAll('export ', '');
  await assert.rejects(vm.runInContext(push + ';currentSubscription()', context), /provider failure/);
  assert.equal(unsubscribed, true);
});
test('notification checkpoint writes do not duplicate history samples', async () => {
  const queries = [];
  const context = vm.createContext({ Date, JSON, Number, env: { DB: {
    prepare: sql => ({ bind: () => { queries.push(sql); return {}; } }), batch: async () => {}
  } }, rides: [{ id: 'mk:test', parkId: 6, isOpen: true, waitTime: 30 }] });
  await vm.runInContext(section('async function writeCurrentRideSnapshot(', 'async function readPriorRideState(') + ';writeCurrentRideSnapshot(env, rides, true)', context);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /INSERT OR REPLACE INTO notification_ride_state/);
});
const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
test('startup binds navigation and renders before pending diagnostics or registration', async () => {
  let rendered = false;
  const nav = { dataset: { viewTarget: 'explore' } };
  const context = vm.createContext({
    setTheme() {}, setupPullToRefresh() {}, renderStatusBanner() {},
    navigator: { serviceWorker: { addEventListener() {}, register: () => new Promise(() => {}) } },
    watchForServiceWorkerUpdate() {}, backendHealth: () => new Promise(() => {}), fetchAnalyticsStatus: () => new Promise(() => {}),
    refreshPushState: () => new Promise(() => {}), $$: () => [nav], $: () => ({}),
    window: { addEventListener() {} }, document: { addEventListener() {} }, handleDialogKeydown() {},
    rideData: { addEventListener() {}, refresh: () => new Promise(() => {}) },
    store: { addEventListener() {}, snapshot: { activeView: 'explore' } }, views: { explore: {} },
    selectView() { rendered = true; }
  });
  vm.runInContext(app.slice(app.indexOf('async function init()'), app.lastIndexOf('init();')) + ';init()', context);
  assert.equal(rendered, true);
  assert.equal(typeof nav.onclick, 'function');
});
test('sync failures stay pending; queued writes preserve the latest rules', async () => {
  const calls = [];
  let release;
  const context = vm.createContext({
    rulesSynced: false, syncQueue: Promise.resolve(), pushOn: true,
    store: { snapshot: { rules: [{ rideId: 'old' }] } },
    syncRules: async rules => {
      calls.push(rules);
      if (calls.length === 1) await new Promise(resolve => { release = resolve; });
      return { synced: true };
    },
    renderSettings() {}, renderWatching() {}, bindDynamic() {}, toast() {}
  });
  vm.runInContext(app.slice(app.indexOf('function safeSync('), app.indexOf('async function refreshPushState(')), context);
  const first = vm.runInContext('safeSync()', context);
  await Promise.resolve();
  context.store.snapshot.rules = [{ rideId: 'new' }];
  const second = vm.runInContext('safeSync()', context);
  release();
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.equal(calls[1][0].rideId, 'new');
  context.syncRules = async () => { throw Error('offline'); };
  assert.equal(await vm.runInContext('safeSync()', context), false);
  assert.equal(context.rulesSynced, false);
});
test('offline relaunch restores last-good rides even when refresh fails', async () => {
  const saved = JSON.stringify({ updatedAt: '2026-09-24T00:00:00Z', parks: [[6, { rides: [{ id: 'mk:test', lastUpdated: '2026-09-24T00:00:00Z' }] }]] });
  const api = fs.readFileSync(new URL('../assets/js/api.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    EventTarget, Event, Map, Date, JSON, Number, PARKS: [{ id: 6 }],
    localStorage: { getItem: () => saved }, navigator: { onLine: false },
    fetchPark: async () => { throw Error('offline'); }
  });
  vm.runInContext(api.slice(api.indexOf('export class RideData'), api.indexOf('export const rideData')).replace('export ', '') + ';globalThis.data = new RideData()', context);
  await context.data.refresh();
  assert.equal(context.data.rideById('mk:test').id, 'mk:test');
  assert.equal(context.data.updatedAt, '2026-09-24T00:00:00Z');
  assert.match(context.data.error, /offline/);
});
test('service worker precaches all modules and never caches HTTP failures', async () => {
  const handlers = {};
  const precached = [];
  const writes = [];
  const context = vm.createContext({
    URL, Response, Request: class { constructor(url) { this.url = url; } },
    location: { origin: 'https://app.example' },
    self: { addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => ({ addAll: async urls => precached.push(...urls.map(x => x.url)), match: async () => null, put: async (...args) => writes.push(args) }) },
    fetch: async () => new Response('unavailable', { status: 503 })
  });
  vm.runInContext(fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8'), context);
  let pending;
  handlers.install({ waitUntil: promise => { pending = promise; } });
  await pending;
  for (const name of ['app', 'api', 'data', 'store', 'push', 'config']) assert(precached.includes(`./assets/js/${name}.js?v=1.6.5`));
  handlers.fetch({ request: { method: 'GET', url: 'https://app.example/assets/js/data.js?v=1.6.5' }, respondWith: promise => { pending = promise; } });
  assert.equal((await pending).status, 503);
  assert.equal(writes.length, 0);
});
test('editing a watch keeps its exact expiration unless a new duration is selected', async () => {
  for (const duration of ['keep', '3h']) {
    const existing = { rideId: 'mk:test', parkId: 6, expiresAt: 1234567890, createdAt: 42, reopen: true };
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, { value: duration, checked: true, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener() {}, focus() {} });
      return elements.get(selector);
    };
    let saved;
    const context = vm.createContext({
      rideData: { rideById: () => ({ id: 'mk:test', parkId: 6, name: 'Test Mountain' }) },
      store: { ruleForRide: () => existing, saveRule: value => { saved = value; } },
      document: { activeElement: null, body: element('body') }, HTMLElement: class {},
      sheet: element('sheet'), backdrop: element('backdrop'), sheetReturnFocus: null,
      $: element, $$: () => [], escapeHtml: x => x, parkName: () => 'MK', rideStatus: () => ({ wait: 30 }),
      requestAnimationFrame: callback => callback(), loadRideInsights() {}, closeSheet() {}, shareRide() {},
      durationExpiry: () => 9999999999, pushOn: false, toast() {}, Date, Number, Boolean
    });
    vm.runInContext(app.slice(app.indexOf('function openRide('), app.indexOf('async function loadRideInsights(')) + ';openRide("mk:test")', context);
    await element('#watchForm').onsubmit({ preventDefault() {} });
    assert.equal(saved.expiresAt, duration === 'keep' ? existing.expiresAt : 9999999999);
  }
});


test('crowd estimates only display within current known park hours', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const code = app.slice(app.indexOf('function crowdMarkup('), app.indexOf('function zonedDateToUtc('));
  const context = vm.createContext({ Date, Number,
    dateKeyInZone: (date, timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date),
    crowdPresentation: () => ({ kind: 'note', text: 'estimate' }), escapeHtml: x => x
  });
  const markup = vm.runInContext(code + ';crowdMarkup', context);
  const hours = { date: '2026-09-24', timezone: 'America/New_York', openingTime: '2026-09-24T09:00:00-04:00', closingTime: '2026-09-25T01:00:00-04:00' };
  assert.equal(markup({}, hours, Date.parse('2026-09-24T08:59:00-04:00')), '');
  assert.match(markup({}, hours, Date.parse(hours.openingTime)), /estimate/);
  assert.equal(markup({}, hours, Date.parse(hours.closingTime)), '');
  assert.equal(markup({}, { ...hours, closedToday: true }, Date.parse(hours.openingTime)), '');
  assert.equal(markup({}, null, Date.parse(hours.openingTime)), '');
  assert.equal(markup({}, { ...hours, openingTime: 'invalid' }, Date.parse(hours.openingTime)), '');
});
