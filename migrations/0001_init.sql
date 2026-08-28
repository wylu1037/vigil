-- Append-only time series of relay probes.
-- No explicit primary key: rowid is enough for an append-only table.

CREATE TABLE IF NOT EXISTS checks (
  ts         INTEGER NOT NULL, -- Unix ms, when the probe started
  ok         INTEGER NOT NULL, -- 0 / 1
  status     INTEGER NOT NULL, -- HTTP status, 0 when the request never landed
  latency_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checks_ts ON checks(ts);
