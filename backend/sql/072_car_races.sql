-- Drag races: point to point, to a place on the driving roads. The host picks the finish and the
-- stake; every racer pays the stake in when joining and the server pays the pot to the first home.
CREATE TABLE IF NOT EXISTS car_races (
    id TEXT PRIMARY KEY,
    host_character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    dest_place TEXT NOT NULL,
    dest_label TEXT NOT NULL,
    stake BIGINT NOT NULL DEFAULT 0 CHECK (stake >= 0),
    -- stakes in the pot: racers who quit after the start leave theirs behind
    paid_in INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'running', 'done', 'cancelled')),
    start_x REAL NOT NULL,
    start_z REAL NOT NULL,
    start_h REAL NOT NULL,
    dest_x REAL NOT NULL,
    dest_z REAL NOT NULL,
    starts_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    winner_character_id TEXT,
    prize BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS car_races_status_idx ON car_races (status, created_at);

CREATE TABLE IF NOT EXISTS car_race_entries (
    race_id TEXT NOT NULL REFERENCES car_races(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot INT NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (race_id, character_id)
);
CREATE INDEX IF NOT EXISTS car_race_entries_character_idx ON car_race_entries (character_id);
