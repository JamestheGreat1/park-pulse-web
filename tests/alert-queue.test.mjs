import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  ensureAlertQueueSchema, enqueueRideAlerts, processPendingRideAlerts,
  pendingAlertValid, pruneExpiredRideAlerts, MAX_NEW_ALERTS_PER_TICK
} from '../worker/src/alert-queue.js';

const NOW = 1700000000000;
const baseRide = () => ({ id: 'mk:test', parkId: 6, name: 'Test Mountain', isOpen: true, waitTime: 20 });
const baseRule = () => ({ rideId: 'mk:test', reopen: false, threshold: 40, expiresAt: null });
const makeAlert = (overrides = {}) => ({
  endpoint: 'https://push.example/device-1',
  rideId: 'mk:test',
  kind: 'wait',
  threshold: 40,
  payload: { title: 'Test Mountain • 20 min', body: 'Target ≤40 • Magic Kingdom' },
  ...overrides
});

function memoryD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec("CREATE TABLE subscriptions(endpoint TEXT PRIMARY KEY)");
  sqlite.exec("CREATE TABLE notification_log_v2(endpoint TEXT NOT NULL,ride_key TEXT NOT NULL,kind TEXT NOT NULL,last_sent INTEGER NOT NULL,PRIMARY KEY(endpoint,ride_key,kind))");
  function wrapper(sql, args = []) {
    return {
      bind(...next) { return wrapper(sql, next); },
      run() {
        const result = sqlite.prepare(sql).run(...args);
        return { meta: { changes: Number(result.changes || 0) } };
      },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async first() { return sqlite.prepare(sql).get(...args) || null; }
    };
  }
  return {
    sqlite,
    DB: {
      prepare: sql => wrapper(sql),
      async batch(queries) {
        sqlite.exec('BEGIN TRANSACTION');
        try {
          const results = [];
          for (const query of queries) results.push(query.run());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }
    }
  };
}
async function setup() {
  const env = memoryD1();
  await ensureAlertQueueSchema(env);
  env.sqlite.prepare('INSERT INTO subscriptions(endpoint) VALUES(?)').run(makeAlert().endpoint);
  return env;
}
const config = (env, overrides = {}) => ({
  rides: [baseRide()],
  subscriptions: [{ endpoint: makeAlert().endpoint, rules: [baseRule()] }],
  matchesRule: (rule, ride) => rule.rideId === ride.id,
  isCoolingDown: async () => false,
  send: async () => true,
  now: NOW,
  ...overrides
});
function queued(env) {
  return env.sqlite.prepare('SELECT * FROM pending_ride_alerts').all();
}

test('temporary 503 keeps a persisted transition for the next scheduled run', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [makeAlert()], NOW);
  let calls = 0;
  const result = await processPendingRideAlerts(env, config(env, {
    send: async () => {
      calls++;
      if (calls === 1) {
        const error = new Error('provider unavailable');
        error.pushStatus = 503;
        throw error;
      }
      return true;
    }
  }));
  assert.equal(result.failed, 1);
  assert.equal(result.pending, 1);
  assert.equal(queued(env)[0].attempts, 1);
  const second = await processPendingRideAlerts(env, config(env, {
    now: NOW + 5 * 60 * 1000,
    send: async () => { calls++; return true; }
  }));
  assert.equal(calls, 2);
  assert.equal(second.delivered, 1);
  assert.equal(second.retried, 1);
  assert.equal(second.pending, 0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM notification_log_v2').get().n, 1);
});

test('duplicate inserts are idempotent and concurrent runs claim once', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [makeAlert()], NOW);
  await enqueueRideAlerts(env, [makeAlert()], NOW + 5);
  assert.equal(queued(env).length, 1);
  let delivered = 0;
  const opts = config(env, { send: async () => { delivered++; await Promise.resolve(); return true; } });
  const [first, second] = await Promise.all([
    processPendingRideAlerts(env, opts),
    processPendingRideAlerts(env, opts)
  ]);
  assert.equal(delivered, 1);
  assert.equal(first.delivered + second.delivered, 1);
  assert.equal(queued(env).length, 0);
});

test('edited, removed and expired watch rules discard pending events', async () => {
  for (const rules of [
    [{ ...baseRule(), threshold: 10 }],
    [{ ...baseRule(), expiresAt: NOW - 1 }],
    []
  ]) {
    const env = await setup();
    await enqueueRideAlerts(env, [makeAlert()], NOW);
    let sent = 0;
    const result = await processPendingRideAlerts(env, config(env, {
      subscriptions: [{ endpoint: makeAlert().endpoint, rules }],
      send: async () => { sent++; return true; }
    }));
    assert.equal(sent, 0);
    assert.equal(result.discarded, 1);
    assert.equal(result.pending, 0);
  }
});

test('reopening alerts are dropped after the attraction closes again', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [makeAlert({ kind: 'reopen', threshold: null })], NOW);
  const result = await processPendingRideAlerts(env, config(env, {
    rides: [{ ...baseRide(), isOpen: false }],
    subscriptions: [{ endpoint: makeAlert().endpoint, rules: [{ ...baseRule(), reopen: true }] }]
  }));
  assert.equal(result.delivered, 0);
  assert.equal(result.discarded, 1);
});

test('live target validation prevents outdated threshold notifications', async () => {
  const pending = { kind: 'wait', threshold: 40, expires_at: NOW + 1000 };
  assert.equal(pendingAlertValid(pending, { ...baseRide(), waitTime: 45 }, baseRule(), NOW), false);
  assert.equal(pendingAlertValid(pending, { ...baseRide(), waitTime: null }, baseRule(), NOW), false);
  assert.equal(pendingAlertValid(pending, { ...baseRide(), waitTime: 0 }, baseRule(), NOW), true);
  assert.equal(pendingAlertValid(pending, baseRide(), baseRule(), NOW + 1001), false);
});

test('404/410 endpoint rejection purges its subscription and pending notifications', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [
    makeAlert(), makeAlert({ rideId: 'mk:other', kind: 'reopen', threshold: null })
  ], NOW);
  const result = await processPendingRideAlerts(env, config(env, { send: async () => false }));
  assert.equal(result.discarded, 1);
  assert.equal(queued(env).length, 0);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0);
});

test('stale source does not send until fresh data becomes available', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [makeAlert()], NOW);
  const stale = await processPendingRideAlerts(env, config(env, {
    rides: [{ ...baseRide(), sourceStale: true }],
    send: async () => { throw new Error('should not send stale source'); }
  }));
  assert.equal(stale.delivered, 0);
  assert.equal(stale.pending, 1);
  const fresh = await processPendingRideAlerts(env, config(env, { now: NOW + 5 * 60 * 1000 }));
  assert.equal(fresh.delivered, 1);
});

test('expired and edited-threshold queue entries can be replaced by fresh transitions', async () => {
  const env = await setup();
  await enqueueRideAlerts(env, [makeAlert()], NOW);
  await enqueueRideAlerts(env, [makeAlert({
    threshold: 25,
    payload: { title: 'A new threshold' }
  })], NOW + 1000);
  assert.equal(queued(env).length, 1);
  assert.equal(queued(env)[0].threshold, 25);
  assert.equal(queued(env)[0].created_at, NOW + 1000);
  assert.equal(JSON.parse(queued(env)[0].payload).title, 'A new threshold');

  const again = NOW + 25 * 60 * 1000;
  await enqueueRideAlerts(env, [makeAlert()], again);
  assert.equal(queued(env).length, 1);
  assert.equal(queued(env)[0].threshold, 40);
  assert.equal(queued(env)[0].created_at, again);
  assert.equal(queued(env)[0].attempts, 0);
});

test('source-missing or temporarily absent rides defer instead of deleting valid alerts', async () => {
  for (const rides of [
    [{ ...baseRide(), isOpen: false, sourceMissing: true }],
    []
  ]) {
    const env = await setup();
    await enqueueRideAlerts(env, [makeAlert()], NOW);
    const result = await processPendingRideAlerts(env, config(env, {
      rides,
      send: async () => { throw Error('Must not send without fresh data'); }
    }));
    assert.equal(result.pending, 1);
    assert.equal(result.discarded, 0);
    assert.equal(result.delivered, 0);
  }
});

test('pending alerts expire and queued inserts are bounded before checkpoint', async () => {
  const env = await setup();
  await assert.rejects(enqueueRideAlerts(
    env, Array.from({ length: MAX_NEW_ALERTS_PER_TICK + 1 }, () => makeAlert()), NOW
  ), /insertion limit/);
  assert.equal(queued(env).length, 0);
  await enqueueRideAlerts(env, [makeAlert()], NOW);
  await pruneExpiredRideAlerts(env, NOW + 21 * 60 * 1000);
  assert.equal(queued(env).length, 0);
});

test('D1 write failure does not acknowledge an unpersisted transition', async () => {
  const env = await setup();
  const broken = { DB: { ...env.DB, batch: async () => { throw new Error('D1 write failed'); } } };
  await assert.rejects(enqueueRideAlerts(broken, [makeAlert()], NOW), /D1 write failed/);
  assert.equal(queued(env).length, 0);
});
