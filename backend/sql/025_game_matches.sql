-- Phone → Games: online matches (snooker first). Player 1 = host (who challenged / queued),
-- player 2 = guest. Bet stakes are taken from both wallets when the match is set up and held
-- here until it ends; the winner gets the pot. Both phones report the result; if they agree
-- the pot is paid, if they disagree both stakes go back ('disputed').
CREATE TABLE IF NOT EXISTS game_matches (
    id TEXT PRIMARY KEY,
    game TEXT NOT NULL,
    variant TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'challenge' CHECK (kind IN ('challenge', 'quick')),
    host_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    guest_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
    stake BIGINT NOT NULL DEFAULT 0 CHECK (stake >= 0),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'finished', 'declined', 'expired', 'cancelled', 'disputed')),
    host_report TEXT,
    guest_report TEXT,
    winner_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS game_matches_guest_idx ON game_matches (guest_id, status);
CREATE INDEX IF NOT EXISTS game_matches_host_idx ON game_matches (host_id, status);
CREATE INDEX IF NOT EXISTS game_matches_quick_idx ON game_matches (kind, status, game, variant, stake);

-- Fun from winning, capped per player per day (Lagos time)
CREATE TABLE IF NOT EXISTS game_rewards (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (character_id, day)
);

-- "@x challenged you to Snooker" notes in direct chats
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money', 'game'));
