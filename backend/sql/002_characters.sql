CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    dream_id TEXT,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    badges TEXT[] NOT NULL DEFAULT '{}',
    dream_completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS characters_user_id_idx ON characters(user_id);
