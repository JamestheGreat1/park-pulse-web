CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  watch_ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

-- Legacy v1 ride state is intentionally left in place so an existing deployment
-- can migrate without destructive schema work.
CREATE TABLE IF NOT EXISTS ride_state (
  ride_id INTEGER PRIMARY KEY,
  park_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_open INTEGER NOT NULL,
  wait_time INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ride_state_v2 (
  ride_key TEXT PRIMARY KEY,
  park_id INTEGER NOT NULL,
  source_id TEXT,
  name TEXT NOT NULL,
  land TEXT,
  is_open INTEGER NOT NULL,
  wait_time INTEGER,
  source TEXT NOT NULL,
  source_updated_at TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
  endpoint TEXT NOT NULL,
  ride_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  last_sent INTEGER NOT NULL,
  PRIMARY KEY (endpoint, ride_id, kind)
);

CREATE TABLE IF NOT EXISTS notification_log_v2 (
  endpoint TEXT NOT NULL,
  ride_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  last_sent INTEGER NOT NULL,
  PRIMARY KEY (endpoint, ride_key, kind)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_last_sent ON notification_log(last_sent);
CREATE INDEX IF NOT EXISTS idx_notification_log_v2_last_sent ON notification_log_v2(last_sent);
CREATE INDEX IF NOT EXISTS idx_ride_state_v2_park ON ride_state_v2(park_id);


CREATE TABLE IF NOT EXISTS ride_history (
  ride_key TEXT NOT NULL,
  park_id INTEGER NOT NULL,
  wait_time INTEGER,
  is_open INTEGER NOT NULL,
  source TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (ride_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_ride_history_ride_time
  ON ride_history(ride_key, observed_at);

CREATE INDEX IF NOT EXISTS idx_ride_history_park_time
  ON ride_history(park_id, observed_at);
