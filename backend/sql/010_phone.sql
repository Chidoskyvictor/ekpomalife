-- PHASE: In-game phone — persistent phone_state.
-- Idempotency: REUSE idempotency_keys from 008/009 — do not recreate.

CREATE TABLE IF NOT EXISTS phone_state (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    battery SMALLINT NOT NULL DEFAULT 80 CHECK (battery BETWEEN 0 AND 100),
    charging BOOLEAN NOT NULL DEFAULT false,
    battery_game_time INTEGER NOT NULL DEFAULT 0,
    data_mb INTEGER NOT NULL DEFAULT 50 CHECK (data_mb >= 0),
    wallpaper TEXT NOT NULL DEFAULT 'aau-dusk',
    unread JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_apps TEXT[] NOT NULL DEFAULT ARRAY['ride', 'calendar'],
    last_bank_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
