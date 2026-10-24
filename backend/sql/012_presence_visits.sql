-- Real "online" and "visits" numbers for the top bar (GET /stats).

-- Online = distinct users whose session made a request in the last few minutes.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON sessions (last_seen_at);

-- Simple named counters; 'visits' goes up once per browser visit (POST /stats/visit).
CREATE TABLE IF NOT EXISTS site_counters (
  id TEXT PRIMARY KEY,
  value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO site_counters (id, value) VALUES ('visits', 0) ON CONFLICT (id) DO NOTHING;
