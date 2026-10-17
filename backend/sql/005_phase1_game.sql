-- PHASE 1: setup fields, user profile, game_state, ledger

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE;

ALTER TABLE characters
    ADD COLUMN IF NOT EXISTS character_type TEXT,
    ADD COLUMN IF NOT EXISTS lodging_id TEXT,
    ADD COLUMN IF NOT EXISTS course_id TEXT;

CREATE TABLE IF NOT EXISTS game_state (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    cash BIGINT NOT NULL DEFAULT 0,
    needs JSONB NOT NULL DEFAULT '{"hunger":80,"energy":80,"hygiene":80,"fun":70,"social":70,"study":50}'::jsonb,
    location_id TEXT NOT NULL DEFAULT 'admin-block',
    game_time INTEGER NOT NULL DEFAULT 480,
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ledger_character_id_idx ON ledger(character_id);
CREATE INDEX IF NOT EXISTS ledger_created_at_idx ON ledger(created_at);
