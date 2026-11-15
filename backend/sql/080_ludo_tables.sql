-- Ludo tables (2–4 players, join code, stake held on join; the server rolls the dice).

CREATE TABLE IF NOT EXISTS ludo_tables (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    host_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    max_players INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 4),
    stake BIGINT NOT NULL DEFAULT 0 CHECK (stake >= 0),
    status TEXT NOT NULL DEFAULT 'lobby'
        CHECK (status IN ('lobby', 'active', 'finished', 'cancelled', 'expired')),
    winner_id TEXT REFERENCES characters(id),
    pot BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ludo_tables_lobby_expires_idx ON ludo_tables (status, expires_at);

CREATE TABLE IF NOT EXISTS ludo_table_players (
    table_id TEXT NOT NULL REFERENCES ludo_tables(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    seat INTEGER NOT NULL CHECK (seat >= 0 AND seat < 4),
    stake_held BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (table_id, character_id),
    UNIQUE (table_id, seat)
);
