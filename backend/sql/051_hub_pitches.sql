-- Innovation Hub Pitch Room: the verdict is decided at the start and revealed after the review time.
CREATE TABLE IF NOT EXISTS hub_pitches (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    idea TEXT NOT NULL,
    accepted BOOLEAN NOT NULL,
    amount BIGINT NOT NULL DEFAULT 0,
    ready_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS hub_pitches_character_day ON hub_pitches (character_id, created_at DESC);
