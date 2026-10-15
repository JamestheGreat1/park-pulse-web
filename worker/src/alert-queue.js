// Durable Web Push delivery queue. The ride checkpoint must only advance after
// transition alerts have been recorded in D1, not after a push attempt.
export const RETRY_MAX_AGE_MS = 20 * 60 * 1000;
export const RETRY_BATCH_LIMIT = 6;
export const MAX_NEW_ALERTS_PER_TICK = 200;
const LEASE_MS = 2 * 60 * 1000;

export async function ensureAlertQueueSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS pending_ride_alerts (
      endpoint TEXT NOT NULL,
      ride_key TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('reopen', 'wait')),
      payload TEXT NOT NULL,
      threshold INTEGER,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL,
      lease_until INTEGER,
      PRIMARY KEY (endpoint, ride_key, kind)
    )`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_pending_ride_alerts_due
      ON pending_ride_alerts(next_attempt_at, expires_at)`)
  ]);
}

// All writes in a batch succeed together or fail together. If the queue write
// fails, the calling alert job must NOT overwrite notification_ride_state.
export async function enqueueRideAlerts(env, alerts, now = Date.now()) {
  if (alerts.length > MAX_NEW_ALERTS_PER_TICK) {
    throw new Error("Ride alert queue insertion limit exceeded; checkpoint will not advance");
  }
  if (!alerts.length) return 0;
  const writes = alerts.map((alert) => env.DB.prepare(
    `INSERT OR IGNORE INTO pending_ride_alerts
      (endpoint,ride_key,kind,payload,threshold,created_at,expires_at,next_attempt_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(endpoint,ride_key,kind) DO UPDATE SET
       payload=excluded.payload,
       threshold=excluded.threshold,
       created_at=excluded.created_at,
       expires_at=excluded.expires_at,
       attempts=0,
       next_attempt_at=excluded.next_attempt_at,
       lease_until=NULL
     WHERE pending_ride_alerts.expires_at <= excluded.created_at
        OR pending_ride_alerts.threshold IS NOT excluded.threshold`
  ).bind(
    alert.endpoint,
    String(alert.rideId),
    alert.kind,
    JSON.stringify(alert.payload),
    alert.threshold == null ? null : Number(alert.threshold),
    now,
    now + RETRY_MAX_AGE_MS,
    now
  ));
  await env.DB.batch(writes);
  return alerts.length;
}

export function pendingAlertValid(pending, ride, rule, now = Date.now()) {
  if (!ride || !rule || now >= Number(pending.expires_at)) return false;
  if (rule.expiresAt != null && Number(rule.expiresAt) <= now) return false;
  if (ride.sourceMissing) return false;
  if (pending.kind === "reopen") return Boolean(ride.isOpen && rule.reopen);
  return pending.kind === "wait" &&
    ride.isOpen &&
    rule.threshold != null &&
    Number(rule.threshold) === Number(pending.threshold) &&
    ride.waitTime != null &&
    Number.isFinite(Number(ride.waitTime)) &&
    Number(ride.waitTime) <= Number(rule.threshold);
}

function backoff(attempts) {
  // Five-minute cron cadence, but rate-limit retries if manually triggered.
  return Math.min(10 * 60 * 1000, 60 * 1000 * Math.pow(2, Math.min(4, attempts)));
}

export async function processPendingRideAlerts(env, {
  rides,
  subscriptions,
  matchesRule,
  isCoolingDown,
  send,
  refreshPayload = (pending) => JSON.parse(pending.payload),
  now = Date.now()
}) {
  const summary = { delivered: 0, retried: 0, failed: 0, discarded: 0, pending: 0 };
  const byRide = new Map(rides.map((ride) => [String(ride.id), ride]));
  const byEndpoint = new Map(subscriptions.map((sub) => [sub.endpoint, sub]));
  const rows = (await env.DB.prepare(
    `SELECT endpoint,ride_key,kind,payload,threshold,created_at,expires_at,attempts,next_attempt_at
       FROM pending_ride_alerts
      WHERE next_attempt_at <= ? AND expires_at > ?
        AND (lease_until IS NULL OR lease_until <= ?)
      ORDER BY next_attempt_at ASC, created_at ASC LIMIT ?`
  ).bind(now, now, now, RETRY_BATCH_LIMIT).all()).results || [];

  for (const pending of rows) {
    const claimed = await env.DB.prepare(
      `UPDATE pending_ride_alerts SET lease_until=?
       WHERE endpoint=? AND ride_key=? AND kind=?
         AND next_attempt_at<=? AND expires_at>?
         AND (lease_until IS NULL OR lease_until<=?)`
    ).bind(
      now + LEASE_MS, pending.endpoint, pending.ride_key, pending.kind,
      now, now, now
    ).run();
    if (Number(claimed?.meta?.changes || 0) !== 1) continue;

    const watcher = byEndpoint.get(pending.endpoint);
    const ride = byRide.get(pending.ride_key);
    const rule = watcher?.rules.find((candidate) =>
      ride ? matchesRule(candidate, ride) : String(candidate.rideId) === pending.ride_key
    );
    const discard = async () => {
      await env.DB.prepare(
        "DELETE FROM pending_ride_alerts WHERE endpoint=? AND ride_key=? AND kind=?"
      ).bind(pending.endpoint, pending.ride_key, pending.kind).run();
      summary.discarded++;
    };

    // Removed or expired watches can be discarded immediately, even when a
    // source temporarily loses a ride. Missing/stale source data cannot
    // establish whether an alert is obsolete: defer it until data recovers.
    if (!watcher || !rule || (rule.expiresAt != null && Number(rule.expiresAt) <= now)) {
      await discard();
      continue;
    }
    if (!ride || ride.sourceMissing || ride.sourceStale) {
      await env.DB.prepare(
        `UPDATE pending_ride_alerts SET lease_until=NULL,next_attempt_at=?
         WHERE endpoint=? AND ride_key=? AND kind=?`
      ).bind(now + 5 * 60 * 1000, pending.endpoint, pending.ride_key, pending.kind).run();
      continue;
    }

    // Only send notifications relevant to the CURRENT watch and ride.
    // In particular, edited thresholds must not use old targets.
    if (!pendingAlertValid(pending, ride, rule, now)) {
      await discard();
      continue;
    }

    try {
      if (await isCoolingDown(pending.endpoint, pending.ride_key, pending.kind)) {
        await discard();
        continue;
      }
      const payload = refreshPayload(pending, ride, rule);
      const accepted = await send(watcher, payload, env);
      if (!accepted) {
        // 404/410: the push provider has permanently invalidated the endpoint.
        await env.DB.batch([
          env.DB.prepare("DELETE FROM pending_ride_alerts WHERE endpoint=?").bind(pending.endpoint),
          env.DB.prepare("DELETE FROM subscriptions WHERE endpoint=?").bind(pending.endpoint),
          env.DB.prepare("DELETE FROM notification_log_v2 WHERE endpoint=?").bind(pending.endpoint)
        ]);
        summary.discarded++;
        continue;
      }

      // Atomic cooldown + deletion. Prevents replay if the checkpoint fails
      // after a successful send. External Web Push itself cannot be atomic
      // with D1, so provider-accepted deliveries remain at-least-once.
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO notification_log_v2(endpoint,ride_key,kind,last_sent)
           VALUES(?,?,?,?) ON CONFLICT(endpoint,ride_key,kind)
           DO UPDATE SET last_sent=excluded.last_sent`
        ).bind(pending.endpoint, pending.ride_key, pending.kind, Date.now()),
        env.DB.prepare(
          "DELETE FROM pending_ride_alerts WHERE endpoint=? AND ride_key=? AND kind=?"
        ).bind(pending.endpoint, pending.ride_key, pending.kind)
      ]);
      summary.delivered++;
      if (Number(pending.attempts) > 0) summary.retried++;
    } catch (error) {
      // A provider failure must not lose the queued transition.
      summary.failed++;
      console.warn("Ride alert delivery deferred", error?.pushStatus || error?.code || "send-failed");
      await env.DB.prepare(
        `UPDATE pending_ride_alerts
         SET attempts=attempts+1, next_attempt_at=?,lease_until=NULL
         WHERE endpoint=? AND ride_key=? AND kind=?`
      ).bind(
        Math.min(Number(pending.expires_at), now + backoff(Number(pending.attempts))),
        pending.endpoint, pending.ride_key, pending.kind
      ).run();
    }
  }
  // Lightweight indexed queue count, captured in the existing worker_state
  // checkpoint. /health will not scan the full queue on every request.
  const total = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM pending_ride_alerts WHERE expires_at>?"
  ).bind(now).first();
  summary.pending = Number(total?.total || 0);
  return summary;
}

export async function pruneExpiredRideAlerts(env, now = Date.now()) {
  await env.DB.prepare("DELETE FROM pending_ride_alerts WHERE expires_at<=?")
    .bind(now).run();
}
