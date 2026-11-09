-- Daily login streak (per character, Africa/Lagos game day) and story moments (events shown, per game day).
CREATE TABLE IF NOT EXISTS login_streaks (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    last_checkin_day INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_events (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    event_id TEXT NOT NULL,
    choice INTEGER,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, day, seq)
);
CREATE INDEX IF NOT EXISTS story_events_character_idx ON story_events (character_id, event_id);
