-- Daily missions: each player's 3 missions for a game day, which are done, the one free swap,
-- the daily bonus, and a mission in progress (Start → Finish, checked against its seconds).
CREATE TABLE IF NOT EXISTS daily_missions (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    mission_ids TEXT[] NOT NULL,
    done_ids TEXT[] NOT NULL DEFAULT '{}',
    hidden_place TEXT NOT NULL,
    swapped BOOLEAN NOT NULL DEFAULT FALSE,
    bonus_paid BOOLEAN NOT NULL DEFAULT FALSE,
    started_id TEXT,
    started_at TIMESTAMPTZ,
    bond_targets TEXT[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (character_id, day)
);

-- Missions a player can only ever do once (e.g. "Get your results").
CREATE TABLE IF NOT EXISTS missions_once (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    mission_id TEXT NOT NULL,
    done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, mission_id)
);
