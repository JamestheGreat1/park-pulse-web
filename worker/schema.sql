CREATE TABLE IF NOT EXISTS subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  watch_ids TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ride_state (
  ride_id INTEGER PRIMARY KEY,
  park_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_open INTEGER NOT NULL,
  wait_time INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notification_log (
  endpoint TEXT NOT NULL,
  ride_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  last_sent INTEGER NOT NULL,
  PRIMARY KEY (endpoint, ride_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_updated_at ON subscriptions(updated_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_last_sent ON notification_log(last_sent);
