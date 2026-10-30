import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const worker = fs.readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
const VERSION = JSON.parse(fs.readFileSync(new URL('../version.json', import.meta.url), 'utf8')).version;
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
    ensureNotificationSchema: async () => {},
    readPriorRideState: async () => [{ ...ride, waitTime: beforeWait, updatedAt: Date.now() }],
    fetchCurrentRideSnapshot: async () => ({ rides: [ride] }),
    groupByPark: rows => new Map([[6, rows]]), normalizeRules: x => x,
    ruleMatchesRide: () => true, notificationRideName: () => 'Test', safeTag: x => x,
    cooldownActive: async () => false, sendPush: async (_, payload) => { sent.push(payload); return true; },
    enqueueRideAlerts: async (_, alerts) => { context.pending = alerts; return alerts.length; },
    processPendingRideAlerts: async () => {
      for (const alert of context.pending || []) sent.push(alert.payload);
      return { delivered: (context.pending || []).length, retried: 0, failed: 0, discarded: 0, pending: 0 };
    },
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
test('queued transitions are recorded before the notification checkpoint', async () => {
  const ride = { id: 'mk:test', parkId: 6, isOpen: true, waitTime: 20 };
  const events = [];
  const sub = { endpoint: 'test', watch_ids: JSON.stringify([{ rideId: ride.id, threshold: 40, reopen: false }]) };
  const context = vm.createContext({
    Date, Intl, Map, JSON, Number, console, LIVE_FRESHNESS_MS: 1200000,
    PARKS: new Map([[6, { name: 'Magic Kingdom' }]]),
    ensureNotificationSchema: async () => {},
    readPriorRideState: async () => [{ ...ride, waitTime: 55, updatedAt: Date.now() }],
    fetchCurrentRideSnapshot: async () => ({ rides: [ride] }),
    groupByPark: rows => new Map([[6, rows]]), normalizeRules: x => x,
    ruleMatchesRide: () => true, notificationRideName: () => 'Test', safeTag: x => x,
    enqueueRideAlerts: async (_, alerts) => { events.push('enqueue'); assert.equal(alerts.length, 1); return 1; },
    processPendingRideAlerts: async () => ({ pending: 1, delivered: 0, retried: 0, failed: 1, discarded: 0 }),
    sendPush: async () => true,
    writeCurrentRideSnapshot: async (_, rows, checkpoint = false) => events.push(checkpoint ? 'checkpoint' : 'history'),
    env: { DB: { prepare: () => ({ all: async () => ({ results: [sub] }), bind: () => ({ run: async () => {} }) }) } }
  });
  await vm.runInContext(watcher + ';runRideWatch(env)', context);
  assert.deepEqual(events, ['enqueue', 'history', 'checkpoint']);
});

test('failed queue insertion never advances ride checkpoint', async () => {
  const ride = { id: 'mk:test', parkId: 6, isOpen: true, waitTime: 20 };
  let checkpointed = false;
  const sub = { endpoint: 'test', watch_ids: JSON.stringify([{ rideId: ride.id, threshold: 40, reopen: false }]) };
  const context = vm.createContext({
    Date, Intl, Map, JSON, Number, console, LIVE_FRESHNESS_MS: 1200000,
    PARKS: new Map([[6, { name: 'Magic Kingdom' }]]),
    ensureNotificationSchema: async () => {},
    readPriorRideState: async () => [{ ...ride, waitTime: 55, updatedAt: Date.now() }],
    fetchCurrentRideSnapshot: async () => ({ rides: [ride] }),
    groupByPark: rows => new Map([[6, rows]]), normalizeRules: x => x,
    ruleMatchesRide: () => true, notificationRideName: () => 'Test', safeTag: x => x,
    enqueueRideAlerts: async () => { throw new Error('D1 unavailable'); },
    processPendingRideAlerts: async () => { throw new Error('should not process'); },
    writeCurrentRideSnapshot: async () => { checkpointed = true; },
    env: { DB: { prepare: () => ({ all: async () => ({ results: [sub] }), bind: () => ({ run: async () => {} }) }) } }
  });
  await assert.rejects(vm.runInContext(watcher + ';runRideWatch(env)', context), /D1 unavailable/);
  assert.equal(checkpointed, false);
});

test('ThemeParks attraction waits stay live when the parent park is closed', async () => {
  const code = section('async function fetchThemeParksRides(', 'async function fetchQueueTimesRides(');
  const catalogRide = { key: 'mk:test', name: 'Test Ride', land: 'Tomorrowland', aliases: [] };
  const context = vm.createContext({
    VERSION: 'test',
    Number, String, Map,
    findCatalogRide: () => catalogRide,
    fetch: async () => ({
      ok: true,
      json: async () => ({
        status: 'CLOSED',
        liveData: [{
          name: 'Test Ride',
          entityId: 'themeparks:test',
          status: 'OPERATING',
          lastUpdated: '2026-10-01T22:30:00Z',
          queue: { STANDBY: { waitTime: 30 } }
        }]
      })
    })
  });
  const rides = await vm.runInContext(code + ';fetchThemeParksRides(6, { themeParksId: "mk", rides: [] }, {})', context);
  assert.equal(rides.length, 1);
  assert.equal(rides[0].isOpen, true);
  assert.equal(rides[0].waitTime, 30);
  assert.equal(rides[0].operationalStatus, 'OPERATING');
});

test('ticketed-event state distinguishes the handoff from the active event', () => {
  const code = section('function ticketedEventState(', 'function crowdMedian(');
  const context = vm.createContext({ Date, Number, String });
  vm.runInContext(code, context);
  context.hours = {
    closingTime: '2026-10-01T18:00:00-04:00',
    ticketedEvents: [{
      name: "Mickey's Not-So-Scary Halloween Party",
      openingTime: '2026-10-01T19:00:00-04:00',
      closingTime: '2026-10-02T00:00:00-04:00'
    }]
  };
  assert.equal(vm.runInContext('ticketedEventState(hours, Date.parse("2026-10-01T17:59:00-04:00"))', context), null);
  assert.equal(vm.runInContext('ticketedEventState(hours, Date.parse("2026-10-01T18:30:00-04:00")).phase', context), 'transition');
  assert.equal(vm.runInContext('ticketedEventState(hours, Date.parse("2026-10-01T19:30:00-04:00")).phase', context), 'active');
});

test('manual refresh never advances the notification checkpoint', async () => {
  const calls = [];
  const context = vm.createContext({
    Date, PARKS: new Map([[6, {}]]),
    fetchCurrentRideSnapshot: async () => ({ rides: [], primaryParks: 1, fallbackParks: 0 }),
    writeCurrentRideSnapshot: async (...args) => calls.push(args),
    ensureNotificationSchema: async () => {},
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
    setTheme() {}, setupLiquidGlassMotion() {}, setupPullToRefresh() {},
    setupSheetDismissGesture() {}, renderStatusBanner() {},
    navigator: { serviceWorker: { addEventListener() {}, register: () => new Promise(() => {}) } },
    watchForServiceWorkerUpdate() {}, backendHealth: () => new Promise(() => {}), fetchAnalyticsStatus: () => new Promise(() => {}),
    refreshPushState: () => new Promise(() => {}), $$: () => [nav], $: () => ({}),
    window: { addEventListener() {} }, document: { addEventListener() {} }, handleDialogKeydown() {},
    checkForAppUpdate() {},
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
  for (const name of ['app', 'api', 'data', 'store', 'push', 'config', 'seasonal']) {
    assert(precached.includes(`./assets/js/${name}.js?v=${VERSION}`));
  }
  handlers.fetch({ request: { method: 'GET', url: `https://app.example/assets/js/data.js?v=${VERSION}` }, respondWith: promise => { pending = promise; } });
  assert.equal((await pending).status, 503);
  assert.equal(writes.length, 0);
});
test('editing a watch keeps its exact expiration unless a new duration is selected', async () => {
  for (const duration of ['keep', '3h']) {
    const existing = { rideId: 'mk:test', parkId: 6, expiresAt: 1234567890, createdAt: 42, reopen: true };
    const elements = new Map();
    const element = selector => {
      if (!elements.has(selector)) elements.set(selector, { dataset: {}, value: duration, checked: true, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, addEventListener() {}, focus() {} });
      return elements.get(selector);
    };
    let saved;
    const context = vm.createContext({
      rideData: { rideById: () => ({ id: 'mk:test', parkId: 6, name: 'Test Mountain' }) },
      store: { snapshot: {}, ruleForRide: () => existing, saveRule: value => { saved = value; } },
      document: { activeElement: null, body: element('body') }, HTMLElement: class {},
      sheet: element('sheet'), backdrop: element('backdrop'), sheetReturnFocus: null,
      $: element, $$: () => [], escapeHtml: x => x, parkName: () => 'MK', rideStatus: () => ({ wait: 30 }),
      requestAnimationFrame: callback => callback(), loadRideInsights() {}, loadRideHistory() {}, closeSheet() {}, shareRide() {},
    sharedRidePwaHint: () => '', recommendationReason: () => 'A good wait', installApp() {},
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
    ticketedEventState: () => null,
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

test('ticketed-event handoff keeps live waits but pauses normal-day comparisons', () => {
  const helpers = app.slice(app.indexOf('function zoneParts('), app.indexOf('function zonedDateToUtc('));
  const context = vm.createContext({
    Date, Intl, Number, String, Math,
    document: { querySelector: () => null },
    escapeHtml: value => String(value),
    isRideStale: () => false
  });
  vm.runInContext(
    helpers + "\n" + app.slice(app.indexOf('function rideComparison('), app.indexOf('function typicalComparisonBadge(')),
    context
  );
  context.hours = {
    date: '2026-10-01',
    timezone: 'America/New_York',
    openingTime: '2026-10-01T09:00:00-04:00',
    closingTime: '2026-10-01T18:00:00-04:00',
    closedToday: false,
    ticketedEvents: [{
      name: "Mickey's Not-So-Scary Halloween Party",
      openingTime: '2026-10-01T19:00:00-04:00',
      closingTime: '2026-10-02T00:00:00-04:00'
    }]
  };
  context.rideData = { hoursForPark: () => context.hours };
  context.ride = {
    id: 'mk:test', parkId: 6, isOpen: true, waitTime: 30,
    typicalWait: 60, baselineReady: true, baselineDays: 10, baselineMinutes: 300
  };

  assert.match(
    vm.runInContext('formatParkHours(hours, Date.parse("2026-10-01T18:30:00-04:00"))', context),
    /Event transition/
  );
  assert.match(
    vm.runInContext('formatParkHours(hours, Date.parse("2026-10-01T19:30:00-04:00"))', context),
    /Special event now/
  );
  assert.equal(
    vm.runInContext('rideComparison(ride, Date.parse("2026-10-01T18:30:00-04:00"))', context),
    null
  );
  assert.equal(
    vm.runInContext('rideComparison(ride, Date.parse("2026-10-01T19:30:00-04:00"))', context),
    null
  );
  assert.equal(
    vm.runInContext('rideComparison(ride, Date.parse("2026-10-01T17:30:00-04:00")).percentDelta', context),
    -50
  );
});

test('time display uses the device timezone by default without changing park-state logic', () => {
  const helpers = app.slice(app.indexOf('function zoneParts('), app.indexOf('function zonedDateToUtc('));
  const context = vm.createContext({ Date, Intl, Number, String, Math, escapeHtml: value => String(value), document: { querySelector: () => null } });
  vm.runInContext(helpers, context);
  context.hours = {
    date: '2026-10-01',
    timezone: 'America/New_York',
    openingTime: '2026-10-01T09:00:00-04:00',
    closingTime: '2026-10-01T18:00:00-04:00',
    closedToday: false,
    ticketedEvents: [{
      name: "Mickey's Not-So-Scary Halloween Party",
      openingTime: '2026-10-01T19:00:00-04:00',
      closingTime: '2026-10-02T00:00:00-04:00'
    }]
  };

  const now = '2026-10-01T17:30:00-04:00';
  const localHours = vm.runInContext('formatParkHours(hours, Date.parse("' + now + '"), true, "America/Denver")', context);
  const parkHours = vm.runInContext('formatParkHours(hours, Date.parse("' + now + '"), false, "America/Denver")', context);
  assert.match(localHours, /7:00 AM–4:00 PM/);
  assert.match(parkHours, /9:00 AM–6:00 PM/);

  const localEvent = vm.runInContext('formatTicketedEvents(hours, true, "America/Denver", Date.parse("' + now + '"))[0].hours', context);
  const parkEvent = vm.runInContext('formatTicketedEvents(hours, false, "America/Denver", Date.parse("' + now + '"))[0].hours', context);
  assert.match(localEvent, /5:00 PM–10:00 PM/);
  assert.match(parkEvent, /7:00 PM–12:00 AM/);

  assert.equal(
    vm.runInContext('parkOperatingState(hours, Date.parse("2026-10-01T18:30:00-04:00")).key', context),
    'transition'
  );
});

test('park status makes real closures distinct from event states', () => {
  const helpers = app.slice(app.indexOf('function zoneParts('), app.indexOf('function zonedDateToUtc('));
  const context = vm.createContext({ Date, Intl, Number, String, Math, escapeHtml: value => String(value), document: { querySelector: () => null } });
  vm.runInContext(helpers, context);
  context.hours = {
    date: '2026-10-01',
    timezone: 'America/New_York',
    openingTime: '2026-10-01T09:00:00-04:00',
    closingTime: '2026-10-01T18:00:00-04:00',
    closedToday: false,
    ticketedEvents: [{
      name: "Mickey's Not-So-Scary Halloween Party",
      openingTime: '2026-10-01T19:00:00-04:00',
      closingTime: '2026-10-02T00:00:00-04:00'
    }]
  };
  context.plainHours = { ...context.hours, ticketedEvents: [] };

  assert.equal(vm.runInContext('parkOperatingState(hours, Date.parse("2026-10-01T12:00:00-04:00")).key', context), 'open');
  assert.equal(vm.runInContext('parkOperatingState(hours, Date.parse("2026-10-01T18:30:00-04:00")).key', context), 'transition');
  assert.equal(vm.runInContext('parkOperatingState(hours, Date.parse("2026-10-01T19:30:00-04:00")).key', context), 'event');
  assert.equal(vm.runInContext('parkOperatingState(plainHours, Date.parse("2026-10-01T08:30:00-04:00")).phase', context), 'before-open');
  assert.equal(vm.runInContext('parkOperatingState(plainHours, Date.parse("2026-10-01T18:30:00-04:00")).phase', context), 'after-close');
  assert.match(vm.runInContext('parkStatusPillMarkup(parkOperatingState(plainHours, Date.parse("2026-10-01T18:30:00-04:00")))', context), /CLOSED/);

  const featureHelpers = app.slice(app.indexOf('function closedParkMarkup('), app.indexOf('function recommendationScore('));
  assert.match(featureHelpers, /park-closed-card/);
  assert.match(featureHelpers, /status\?\.key === "closed"/);
  const explore = app.slice(app.indexOf('function renderExplore('), app.indexOf('function renderWatching('));
  assert.match(explore, /park-status-slot/);
  assert.match(explore, /park-chip-status/);
  assert.match(explore, /park-feature-slot/);
});
test('favorites persist independently of notification watches', () => {
  const saved = new Map();
  const context = vm.createContext({ EventTarget, Event, structuredClone, Date, Number, JSON,
    CustomEvent: class extends Event { constructor(name, opts) { super(name); this.detail = opts.detail; } },
    window: {}, localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v) } });
  const code = fs.readFileSync(new URL('../assets/js/store.js', import.meta.url), 'utf8').replaceAll('export ', '');
  vm.runInContext(code + ';store.toggleFavorite("mk:test");', context);
  const state = JSON.parse(saved.values().next().value);
  assert.deepEqual(state.favorites, ['mk:test']);
  assert.deepEqual(state.rules, []);
  assert.equal(state.useLocalTime, true);
  vm.runInContext('store.toggleFavorite("mk:test");', context);
  assert.deepEqual(JSON.parse(saved.values().next().value).favorites, []);
});

test('Favorites narrows Best Now without changing its ordering logic', () => {
  const code = app.slice(app.indexOf('function sortedRides('), app.indexOf('function rideCard('));
  const context = vm.createContext({ isRideStale: r => !!r.stale, rideComparison: r => ({ratio:r.ratio}) });
  vm.runInContext(code, context);
  const rides = [
    {id:'best',name:'Best',isOpen:true,ratio:0.5,waitTime:20},
    {id:'favorite-good',name:'Favorite Good',isOpen:true,ratio:0.7,waitTime:25},
    {id:'favorite-ok',name:'Favorite OK',isOpen:true,ratio:0.9,waitTime:15},
    {id:'favorite-closed',name:'Favorite Closed',isOpen:false,ratio:0.1,waitTime:0}
  ];
  context.rides = rides;
  context.state = {query:'',openOnly:false,favoritesOnly:true,sort:'recommended',favorites:['favorite-good','favorite-ok','favorite-closed']};
  assert.equal(
    vm.runInContext('sortedRides(rides,state).map(r=>r.id).join(",")',context),
    'favorite-good,favorite-ok,favorite-closed'
  );
});

test('ride cards bind Favorite and Alert without quick actions', () => {
  const block = app.slice(app.indexOf('function bindRideCards('), app.indexOf('function renderRideResults('));
  assert.match(block, /querySelectorAll\('\[data-favorite\]'\)/);
  assert.match(block, /querySelectorAll\('\[data-open-ride\]'\)/);
  assert.doesNotMatch(block, /data-quick-actions|quick-action/);
  assert.doesNotMatch(block, /\$\('\[data-(favorite|open-ride)\]'.*\.forEach/);
});

test('Next Up skips stale, closed, and source-missing rides', () => {
  const code = app.slice(app.indexOf('function recommendationScore('), app.indexOf('function rideStatus('));
  const rides = [
    {id:'other',name:'Other Ride',parkId:6,isOpen:true,waitTime:45},
    {id:'best',name:'Best Value',parkId:6,isOpen:true,waitTime:15},
    {id:'open',name:'Open Ride',parkId:6,isOpen:true,waitTime:5},
    {id:'closed',name:'Closed',parkId:6,isOpen:false,waitTime:0},
    {id:'stale',name:'Stale',parkId:6,isOpen:true,waitTime:5,stale:true},
    {id:'missing',name:'Missing',parkId:6,isOpen:true,waitTime:5,sourceMissing:true}
  ];
  const context = vm.createContext({
    Date, Number, String, Set, Math,
    store:{snapshot:{}},
    rideData:{ridesForPark:()=>rides,rideById:id=>rides.find(r=>r.id===id)},
    isRideStale:r=>Boolean(r.stale),
    rideComparison:r=>r.id==='best'?{ratio:.5,percentDelta:-50}:r.id==='other'?{ratio:1,percentDelta:0}:null,
    rideStatus:r=>({stale:false,wait:String(r.waitTime),label:'Operating'}),
    escapeHtml:value=>String(value),
    nextUpOffset:0
  });
  vm.runInContext(code, context);
  context.state = {selectedParkId:6,favorites:[],rules:[]};
  assert.deepEqual(vm.runInContext('recommendationCandidates(state).map(r=>r.id)', context), ['best','open','other']);
});

test('history keeps zero waits, null waits, and closures distinct and bounds queries', async () => {
  let bindings, query;
  const now = Date.parse('2026-09-24T12:00:00Z');
  const context = vm.createContext({ Date, Number, catalogRideByKey: () => ({ parkId: 6 }), parkTimezone: () => "America/New_York", parkDayStartMs: () => now-8*3600000,
    env: {DB:{prepare(sql){query=sql;return {bind(...args){bindings=args;return {all:async()=>({results:[
      {wait_time:0,is_open:1,observed_at:now-60000},
      {wait_time:null,is_open:1,observed_at:now-30000},
      {wait_time:null,is_open:0,observed_at:now}
    ]})}}}}}}, now });
  vm.runInContext(section('async function getRideHistory(', 'async function getRideInsights('),context);
  const result=await vm.runInContext('getRideHistory(env,"mk:test","30d",now)',context);
  assert.equal(result.points[0].waitTime,0);
  assert.equal(result.points[1].waitTime,null);
  assert.equal(result.points[2].isOpen,false);
  assert.equal(bindings[1],now-30*86400000);
  assert.equal(bindings[3],30*60000);
  assert.match(query,/LIMIT 1441/);
});

test('notification schema and scheduler health from 1.6.6 remain intact', async () => {
  let schema;
  const context=vm.createContext({Date,Number,ensureAlertQueueSchema:async()=>{},env:{DB:{prepare:sql=>sql,batch:async statements=>{schema=statements}}}});
  await vm.runInContext(section('async function ensureNotificationSchema(', 'async function getNotificationHealth(')+';ensureNotificationSchema(env)',context);
  assert(schema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS notification_ride_state')));
  assert(schema.some(sql=>sql.includes('CREATE TABLE IF NOT EXISTS notification_log_v2')));
  const healthCode=section('async function getNotificationHealth(', 'async function readPriorRideState(');
  for (const [age,status] of [[0,'running'],[20*60000,'stale'],[null,'waiting']]) {
    context.env={DB:{prepare:()=>({first:async()=>({
      updated_at: age === null ? 0 : Date.now()-age,
      payload: JSON.stringify({checkpointRides:47,cadenceMinutes:5})
    })})}};
    const result=await vm.runInContext(healthCode+';getNotificationHealth(env)',context);
    assert.equal(result.status,status);
  }
  assert.match(app,/Ride alert engine/);
  assert.match(app,/notificationEngine\?\.lastCheck/);
});

test('scheduled alerts and hourly maintenance run in separate invocations', async () => {
  const calls=[];
  const context=vm.createContext({runRideWatch:async()=>calls.push('alerts'),runScheduledMaintenance:async()=>calls.push('maintenance')});
  const method=worker.slice(worker.indexOf('  async scheduled('),worker.indexOf('\n};',worker.indexOf('  async scheduled(')));
  const handler=vm.runInContext('({'+method+'})',context);
  for (const cron of ['*/5 * * * *','17 * * * *']) {
    let job;await handler.scheduled({cron},{},{waitUntil:p=>{job=p}});await job;
  }
  assert.deepEqual(calls,['alerts','maintenance']);
  const alertCode=section('async function runRideWatch(', 'async function runScheduledMaintenance(');
  assert.doesNotMatch(alertCode,/refreshRideBaselines|DELETE FROM ride_history/);
});

test('timezone formatters are reused without changing Eastern date parts', () => {
  let constructions=0;
  const context=vm.createContext({Map,Number,Intl:{DateTimeFormat:class extends Intl.DateTimeFormat {constructor(...args){super(...args);constructions++;}}}});
  vm.runInContext(section('const zoneFormatters =','function zonedDateToUtc('),context);
  const fn=vm.runInContext('zoneParts',context);
  assert.equal(fn(new Date('2026-09-24T12:00:00Z')).hour,8);
  assert.equal(fn(new Date('2026-01-24T12:00:00Z')).hour,7);
  assert.equal(constructions,1);
});


test('no single-selector helper is used with forEach anywhere in the app', () => {
  assert.doesNotMatch(app, /(?<!\$)\$\([^;\n]*\)\.forEach/g);
});




test('PWA keeps Park Day and quick actions native-only', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /view-parkday|parkDayShortcut/);
  assert.doesNotMatch(app, /Park Day Lite|data-quick-actions|openQuickActions|quickAction/);
  assert.match(app, /What should I ride next\?/);
  assert.match(app, /recommendationReason/);
});


test('removed For Me sort migrates back to Best Now', () => {
  const saved = new Map([['parkpulse.rideWatcher.v1', JSON.stringify({sort:'personal'})]]);
  const context = vm.createContext({
    EventTarget, Event, structuredClone, Date, Number, JSON,
    CustomEvent: class extends Event { constructor(name, opts) { super(name); this.detail = opts.detail; } },
    window: { PARKPULSE_CONFIG: {} },
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k,v) => saved.set(k,v) }
  });
  const code = fs.readFileSync(new URL('../assets/js/store.js', import.meta.url), 'utf8').replaceAll('export ', '');
  vm.runInContext(code, context);
  assert.equal(vm.runInContext('store.snapshot.sort', context), 'recommended');
});


test('condensed Status keeps four summary rows and expandable diagnostics', () => {
  const settings = app.slice(app.indexOf('function renderSettings('), app.indexOf('function updateWatchBadge('));
  assert.match(settings, /<div class="settings-section-title">Status<\/div>/);
  assert.match(settings, /<strong>System<\/strong>/);
  assert.match(settings, /<strong>Notifications<\/strong>/);
  assert.match(settings, /<strong>History<\/strong>/);
  assert.match(settings, /<strong>App version<\/strong>/);
  assert.match(settings, /<details class="diagnostics-details"/);
  assert.match(settings, /Show diagnostics/);
  assert.match(settings, /Data source/);
  assert.match(settings, /Ride alert engine/);
});


test('Settings customization bindings survive diagnostics wiring', () => {
  const block = app.slice(app.indexOf('function bindDynamic('), app.indexOf('async function copyText('));
  assert.match(block, /querySelectorAll\('\[data-copy-diagnostics\]'\)/);
  assert.match(block, /const theme = \$\("#themeSelect"\)/);
  assert.match(block, /button\[data-accent-choice\]/);
  assert.match(block, /\[data-glass-style\]/);
  assert.match(block, /seasonalEffectsToggle/);
  assert.doesNotMatch(block, /(?<!\$)\$\([^;\n]*\)\.forEach/g);
});



test('legacy Must-do state is discarded', () => {
  const saved = new Map([['parkpulse.rideWatcher.v1', JSON.stringify({mustDo:['mk:test'],favorites:['mk:test']})]]);
  const context = vm.createContext({
    EventTarget, Event, structuredClone, Date, Number, JSON,
    CustomEvent: class extends Event { constructor(name, opts) { super(name); this.detail = opts.detail; } },
    window: { PARKPULSE_CONFIG: {} },
    localStorage: { getItem: k => saved.get(k) || null, setItem: (k,v) => saved.set(k,v) }
  });
  const code = fs.readFileSync(new URL('../assets/js/store.js', import.meta.url), 'utf8').replaceAll('export ', '');
  vm.runInContext(code, context);
  const snapshot = vm.runInContext('store.snapshot', context);
  assert.equal(snapshot.mustDo, undefined);
  assert.deepEqual(snapshot.favorites, ['mk:test']);
});




test('desktop wait-target controls stay grouped', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('desktop threshold controls stay grouped');
  assert.ok(marker >= 0);
  const finalDesktop = css.slice(marker);
  assert.match(finalDesktop, /grid-template-columns:44px auto auto 44px/);
  assert.match(finalDesktop, /justify-content:end/);
  assert.match(finalDesktop, /min-width:68px/);
});


test('mobile ride sheets override glass overflow and remain scrollable', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('mobile ride sheets must stay vertically scrollable');
  assert.ok(marker >= 0);
  const mobile = css.slice(marker);
  assert.match(mobile, /@media \(max-width:1023px\)/);
  assert.match(mobile, /overflow-y:auto!important/);
  assert.match(mobile, /overflow-x:hidden!important/);
  assert.match(mobile, /-webkit-overflow-scrolling:touch/);
  assert.match(mobile, /padding-bottom:calc\(34px \+ env\(safe-area-inset-bottom,0px\)\)!important/);
});




test('desktop ride sheet uses the denser 1.8.15 layout', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('denser desktop ride-sheet layout');
  assert.ok(marker >= 0);
  const desktop = css.slice(marker);
  assert.match(desktop, /@media \(min-width:1024px\)/);
  assert.match(desktop, /width:min\(640px,calc\(100vw - 72px\)\)!important/);
  assert.match(desktop, /max-height:calc\(100dvh - 64px\)!important/);
  assert.match(desktop, /padding:18px 20px 20px!important/);
  assert.match(desktop, /\.history-chart-wrap\{[^}]*height:150px/s);
  assert.match(desktop, /#watchForm>\.toggle-row,[\s\S]*padding:12px 2px/);
});

test('mobile Liquid Glass ride sheet removes internal overlay shading and duplicate divider', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('simplify mobile Liquid Glass ride sheets');
  assert.ok(marker >= 0);
  const mobile = css.slice(marker);
  assert.match(mobile, /@media \(max-width:1023px\)/);
  assert.match(mobile, /\.ride-sheet::before,/);
  assert.match(mobile, /\.ride-sheet::after/);
  assert.match(mobile, /display:none!important/);
  assert.match(mobile, /\.ride-history\{[^}]*border-bottom:0!important/s);
});


test('desktop ride cards keep subtle glass shading', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('soften desktop ride-card glass shading');
  assert.ok(marker >= 0);
  const desktop = css.slice(marker);
  assert.match(desktop, /@media \(min-width:1024px\)/);
  assert.match(desktop, /data-preview-surface="liquid"\] \.ride-card::before/);
  assert.match(desktop, /opacity:\.48/);
  assert.match(desktop, /scale\(1\.02\)/);
  assert.match(desktop, /data-preview-surface="liquid"\] \.ride-card::after/);
  assert.match(desktop, /opacity:\.58/);
  assert.match(desktop, /data-preview-surface="neutral"\] \.ride-card::before/);
  assert.match(desktop, /--glass-interaction-shift:2px/);
});


test('desktop wait-target controls stay centered away from sheet edges', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('desktop ride-sheet controls + seasonal parity');
  assert.ok(marker >= 0);
  const desktop = css.slice(marker);
  assert.match(desktop, /\.threshold-controls\{[^}]*display:grid!important/s);
  assert.match(desktop, /grid-template-columns:44px auto auto 44px!important/);
  assert.match(desktop, /max-width:calc\(100% - 32px\)!important/);
  assert.match(desktop, /margin:10px auto 0!important/);
  assert.match(desktop, /justify-content:center!important/);
  assert.match(desktop, /\.threshold-controls button\{[^}]*width:44px!important[^}]*min-width:44px!important/s);
});
test('desktop seasonal ambience remains visible and reduced motion gets a static fallback', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('desktop ride-sheet controls + seasonal parity');
  assert.ok(marker >= 0);
  const seasonal = css.slice(marker);
  assert.match(seasonal, /@media \(min-width:1024px\)/);
  assert.match(seasonal, /:root\.season-active \.seasonal-layer\{[^}]*opacity:\.88/s);
  assert.match(seasonal, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(seasonal, /seasonal-layer > \.seasonal-particle:nth-child\(-n\+14\)/);
  assert.match(seasonal, /animation:none!important/);
});


test('wait graph keeps average line without duplicate average text', () => {
  const chart = app.slice(app.indexOf('const avgY = yValue(average)'), app.indexOf('const timeFormat', app.indexOf('const avgY = yValue(average)')));
  assert.match(chart, /history-average-line/);
  assert.doesNotMatch(chart, /history-average-label|avg \$\{average\}m/);
});


test('scaled desktop viewports keep threshold controls centered and clear of glass rim', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('robust ride-sheet threshold geometry');
  assert.ok(marker >= 0);
  const final = css.slice(marker);
  assert.match(final, /ride-sheet::after\{[^}]*display:none!important/s);
  assert.match(final, /@media \(min-width:700px\)/);
  assert.match(final, /#watchForm \.threshold-controls\{[^}]*grid-template-columns:44px 72px 38px 44px!important/s);
  assert.match(final, /width:222px!important/);
  assert.match(final, /max-width:calc\(100% - 48px\)!important/);
  assert.match(final, /margin:10px auto 0!important/);
});


test('Liquid Glass ride sheets have no internal pseudo-layer shading', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('robust ride-sheet threshold geometry');
  assert.ok(marker >= 0);
  const final = css.slice(marker);
  assert.match(final, /ride-sheet::before,/);
  assert.match(final, /ride-sheet::after\{[^}]*display:none!important/s);
});


test('light mode ride sheets use readable milky glass in both surface styles', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('light-mode ride sheets favor readable milky glass over saturated backdrop bleed');
  assert.ok(marker >= 0);
  const light = css.slice(marker);
  assert.match(light, /--sheet-muted-readable:#314158/);
  assert.match(light, /--sheet-accent-readable:color-mix\(in srgb,var\(--blue2\) 64%,var\(--text\)\)/);
  assert.match(light, /data-theme="light"\]\[data-preview-surface="liquid"\] \.ride-sheet/);
  assert.match(light, /rgba\(255,255,255,\.62\)!important/);
  assert.match(light, /saturate\(115%\)/);
  assert.match(light, /data-theme="light"\]\[data-preview-surface="neutral"\] \.ride-sheet/);
  assert.match(light, /rgba\(248,250,253,\.74\)!important/);
  assert.match(light, /saturate\(105%\)/);
  assert.match(light, /\.ride-sheet \.toggle-row small/);
  assert.match(light, /\.ride-sheet \.mini-toggle\.active/);
  assert.match(light, /\.ride-sheet \.history-chart \.history-line/);
  assert.match(light, /data-theme="system"/);
});


test('light mode has darker accent variants without changing glow colors', () => {
  const css = fs.readFileSync(new URL('../assets/css/app.css', import.meta.url), 'utf8');
  const marker = css.lastIndexOf('dedicated high-contrast accent palette for light mode');
  assert.ok(marker >= 0);
  const light = css.slice(marker);
  assert.match(light, /data-theme="light"\]\[data-accent="blue"\][\s\S]*--blue:#1769c2/);
  assert.match(light, /data-theme="light"\]\[data-accent="cyan"\][\s\S]*--blue:#087a8c/);
  assert.match(light, /data-theme="light"\]\[data-accent="violet"\][\s\S]*--blue:#6846c6/);
  assert.match(light, /data-theme="light"\]\[data-accent="pink"\][\s\S]*--blue:#b93e83/);
  assert.match(light, /data-theme="light"\]\[data-accent="orange"\][\s\S]*--blue:#ad520d/);
  assert.match(light, /data-theme="light"\]\[data-accent="green"\][\s\S]*--blue:#147a51/);
  assert.match(light, /data-theme="light"\]\[data-accent="red"\][\s\S]*--blue:#c13f4b/);
  assert.match(light, /data-theme="light"\]\[data-accent="gold"\][\s\S]*--blue:#946700/);
  assert.match(light, /--muted:#4b5b70/);
  assert.match(light, /--green:#167a4a/);
  assert.match(light, /--red:#b2394b/);
  assert.match(light, /data-theme="system"/);
  assert.doesNotMatch(light, /--accent-glow1:/);
});


test('shared rides use the canonical ParkPulse host', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const shareStart = app.indexOf('async function shareRide');
  assert.ok(shareStart >= 0);
  const share = app.slice(shareStart, app.indexOf('function focusableInSheet', shareStart));
  assert.match(share, /new URL\("https:\/\/app\.useparkpulse\.com\/"\)/);
  assert.match(share, /url\.searchParams\.set\("ride", String\(id\)\)/);
});


test('shared ride deep links offer the PWA handoff only in mobile browser mode', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const start = app.indexOf('function sharedRidePwaHint');
  const end = app.indexOf('function iconBell', start);
  assert.ok(start >= 0 && end > start);
  const hint = app.slice(start, end);
  assert.match(hint, /!platform\.mobile \|\| platform\.standalone/);
  assert.match(hint, /searchParams\.get\("ride"\)/);
  assert.match(hint, /Use ParkPulse as an app/);
  assert.match(hint, /data-shared-install/);
  assert.match(app, /\$\('\[data-shared-install\]', sheet\)\?\.addEventListener\("click", installApp\)/);
});


test('15-minute trends are bounded and reject stale, closed, or interrupted rides', async () => {
  const now = Date.parse('2026-10-18T18:30:00Z');
  const sample = (id, minutesAgo, wait, open = true) => ({
    ride_key: id, observed_at: now - minutesAgo * 60000, wait_time: wait, is_open: open ? 1 : 0
  });
  const rows = [
    sample('down', 15, 45), sample('down', 5, 45),
    sample('up', 15, 20), sample('up', 5, 20),
    sample('flat', 15, 40), sample('flat', 5, 40),
    sample('reopened', 15, 45), sample('reopened', 10, null, false), sample('reopened', 5, 30),
    sample('zero', 15, 0), sample('zero', 5, 0),
    sample('stale', 15, 30), sample('stale', 5, 30),
    sample('old-source', 15, 30), sample('old-source', 5, 30),
    sample('missing-history', 15, 30)
  ];
  const current = (id, waitTime, overrides = {}) => ({
    id, isOpen: true, operationalStatus: 'OPERATING', waitTime,
    sourceUpdatedAt: now - 2 * 60000, ...overrides
  });
  const rides = [
    current('down', 30), current('up', 30), current('flat', 43),
    current('reopened', 25), current('zero', 5),
    current('stale', 15, { sourceStale: true }),
    current('old-source', 15, { sourceUpdatedAt: now - 20 * 60000 }),
    current('missing-history', 20), current('closed', null, { isOpen: false })
  ];
  let calls = 0;
  let query = '';
  let bindings = [];
  const env = { DB: { prepare(sql) {
    calls++; query = sql;
    return { bind(...values) {
      bindings = values;
      return { all: async () => ({ results: rows }) };
    } };
  } } };
  const context = vm.createContext({
    Date, Number, Math, Map, env, now, rides,
    WAIT_TREND_LOOKBACK_MS: 15 * 60000,
    WAIT_TREND_TOLERANCE_MS: 5 * 60000,
    WAIT_TREND_MAX_HISTORY_AGE_MS: 10 * 60000,
    isFreshSourceRide: ride => !ride.sourceStale && !ride.sourceMissing && ride.sourceUpdatedAt > now - 15 * 60000,
    sourceTimestampMs: ride => ride.sourceUpdatedAt
  });
  vm.runInContext(section('async function attachWaitTrends(', 'async function attachDowntimeContext('), context);
  const output = await vm.runInContext('attachWaitTrends(env,6,rides,now)', context);
  const trend = id => output.find(ride => ride.id === id).waitTrend;
  assert.equal(calls, 1);
  assert.match(query, /park_id=\?/);
  assert.deepEqual(bindings, [6, now - 20 * 60000, now]);
  assert.equal(trend('down').direction, 'down');
  assert.equal(trend('down').deltaMinutes, 15);
  assert.equal(trend('down').windowMinutes, 15);
  assert.equal(trend('up').direction, 'up');
  assert.equal(trend('up').deltaMinutes, 10);
  assert.equal(trend('zero').deltaMinutes, 5);
  for (const id of ['flat','reopened','stale','old-source','missing-history','closed']) {
    assert.equal(trend(id), undefined, `Trend should be hidden for ${id}`);
  }
  const fail = vm.createContext({
    ...context, env: { DB: { prepare() { throw Error('D1 unavailable'); } } }
  });
  vm.runInContext(section('async function attachWaitTrends(', 'async function attachDowntimeContext('), fail);
  assert.equal((await vm.runInContext('attachWaitTrends(env,6,rides,now)', fail)).length, rides.length);
});

test('wait trend glyph stays compact and hides for stale cards', () => {
  const script = app.slice(app.indexOf('function rideTrendMarkup('), app.indexOf('function rideCard('));
  const context = vm.createContext({ Number });
  vm.runInContext(script, context);
  context.ride = { isOpen: true, waitTrend: { direction: 'down', deltaMinutes: 10, windowMinutes: 15 } };
  context.status = { stale: false };
  assert.match(vm.runInContext('rideTrendMarkup(ride,status)', context), /wait-trend down/);
  assert.match(vm.runInContext('rideTrendMarkup(ride,status)', context), /aria-label="Wait down 10 minutes/);
  context.status.stale = true;
  assert.equal(vm.runInContext('rideTrendMarkup(ride,status)', context), '');
  const card = app.slice(app.indexOf('function rideCard('), app.indexOf('function rideListMarkup('));
  assert.match(card, /ride-wait-line/);
  assert.match(card, /rideTrendMarkup\(ride, status\)/);
});

test('shared catalog preserves WDW parks and gates Disneyland until Phase 2', async () => {
  const source = fs.readFileSync(new URL('../assets/js/catalog.js', import.meta.url), 'utf8');
  const catalog = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
  assert.deepEqual(catalog.PARKS.map(p => p.id), [6, 5, 7, 8]);
  assert.deepEqual(catalog.parksForResort('wdw').map(p => p.id), [6,5,7,8]);
  assert.deepEqual(catalog.parksForResort('dlr'), []);
  assert.deepEqual(catalog.parksForResort('dlr', { includeDisabled: true }).map(p => p.id), [16,17]);
  assert.equal(catalog.parkTimezone(6), 'America/New_York');
  assert.equal(catalog.parkTimezone(16), 'America/Los_Angeles');
  assert.equal(catalog.resortForPark(17).id, 'dlr');
  assert.equal(catalog.parkName(5), 'EPCOT');
  assert.equal(catalog.PARKS.some(p => p.resortId === 'dlr'), false);
  const worker = fs.readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
  assert.match(worker, /import \{ PARKS as ENABLED_PARKS, parkTimezone \} from/);
});

test('park day and baseline slots use park-local time, including daylight saving', () => {
  const script = section('const zoneFormatters =', 'function weightedQuantile(');
  const context = vm.createContext({ Date, Intl, Number, Map, String, Math });
  vm.runInContext(script, context);
  const local = vm.runInContext('({ parkDayStartMs, minutesInZone, localDateOffset })', context);
  const summer = new Date('2026-07-04T20:00:00Z');
  assert.equal(new Date(local.parkDayStartMs(summer, 'America/New_York')).toISOString(), '2026-07-04T07:00:00.000Z');
  assert.equal(new Date(local.parkDayStartMs(summer, 'America/Los_Angeles')).toISOString(), '2026-07-04T10:00:00.000Z');
  assert.equal(local.minutesInZone(summer.getTime(), 'America/New_York'), 16*60);
  assert.equal(local.minutesInZone(summer.getTime(), 'America/Los_Angeles'), 13*60);
  const winter = new Date('2026-01-04T20:00:00Z');
  assert.equal(new Date(local.parkDayStartMs(winter, 'America/Los_Angeles')).toISOString(), '2026-01-04T11:00:00.000Z');
  assert.equal(local.localDateOffset(-1, Date.parse('2026-07-04T05:00:00Z'), 'America/Los_Angeles'), '2026-07-02');
});

test('today watch expiry is local to the ride park, not the current user resort', () => {
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  const script = app.slice(app.indexOf('function zonedDateToUtc('), app.indexOf('function remaining('));
  const context = vm.createContext({
    Date, Math, Number, store: { snapshot: { selectedParkId: 6 } },
    parkTimezone: (id) => id === 16 ? 'America/Los_Angeles' : 'America/New_York',
    zoneParts: (date, timeZone) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle:'h23'
      }).formatToParts(date);
      return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type, Number(p.value)]));
    }
  });
  vm.runInContext(script, context);
  assert.equal(vm.runInContext('durationExpiry.toString().includes("parkDayEnd(parkId)")', context), true);
  const timestamp = Date.parse('2026-07-04T20:00:00Z');
  assert.equal(new Date(vm.runInContext('parkDayEnd(6, new Date('+timestamp+'))',context)).toISOString(), '2026-07-05T07:00:00.000Z');
  assert.equal(new Date(vm.runInContext('parkDayEnd(16, new Date('+timestamp+'))',context)).toISOString(), '2026-07-05T10:00:00.000Z');
  assert.match(app, /durationExpiry\(duration, model\.parkId\)/);
});

test('Worker uses per-park timezone for baselines, events, and history', () => {
  const worker = fs.readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
  assert.match(worker, /minutesInZone\(Date\.now\(\), parkTimezone\(rides\[0\]\.parkId\)\)/);
  assert.match(worker, /minutesInZone\(target, parkTimezone\(parkId\)\)/);
  assert.match(worker, /localHour = zoneParts\(new Date\(now\), parkTimezone\(parkId\)\)\.hour/);
  assert.match(worker, /localDateOffset\(-29, Date\.now\(\), timeZone\)/);
  assert.match(worker, /parkDayStartMs\(new Date\(now\), timeZone\)/);
  assert.doesNotMatch(worker, /easternMinutes|easternHour/);
  const app = fs.readFileSync(new URL('../assets/js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /easternParkDayEnd/);
});
