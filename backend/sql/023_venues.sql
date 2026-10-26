-- Clubs (Sazza first). One row per player per club night: entry paid, VIP, money spent,
-- which crowd group they were put in, and when the app last said they're still inside.
CREATE TABLE IF NOT EXISTS venue_visits (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    venue_id TEXT NOT NULL,
    night_key BIGINT NOT NULL,
    group_no INTEGER NOT NULL DEFAULT 1,
    vip BOOLEAN NOT NULL DEFAULT FALSE,
    spent BIGINT NOT NULL DEFAULT 0,
    entered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ,
    PRIMARY KEY (character_id, venue_id, night_key)
);

CREATE INDEX IF NOT EXISTS venue_visits_inside_idx ON venue_visits (venue_id, night_key, last_seen_at);
CREATE INDEX IF NOT EXISTS venue_visits_spent_idx ON venue_visits (venue_id, night_key, spent DESC);
