-- Games hub: hosted tables (a pending game_matches row with kind 'hosted', stake held in escrow
-- from the host's wallet and refunded by the usual expiry sweep), house rules, and a results log
-- that feeds Top Charts and head-to-head records.
ALTER TABLE game_matches DROP CONSTRAINT IF EXISTS game_matches_kind_check;
ALTER TABLE game_matches
    ADD CONSTRAINT game_matches_kind_check CHECK (kind IN ('challenge', 'quick', 'hosted'));
ALTER TABLE game_matches ADD COLUMN IF NOT EXISTS rules JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS game_matches_hosted_idx ON game_matches (status, expires_at) WHERE kind = 'hosted';
CREATE INDEX IF NOT EXISTS game_matches_active_idx ON game_matches (status, accepted_at DESC) WHERE status = 'active';

-- One row per (player, opponent) in every decided game against a real player. A 1v1 match writes
-- two rows (a win and a loss, or two draws); a 4-player table writes one per pair. Idempotent per match.
CREATE TABLE IF NOT EXISTS game_results (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    opponent_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    game TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('win', 'loss', 'draw')),
    -- Naira gained (win) or lost (loss) from this pairing; 0 for friendly games and draws
    net BIGINT NOT NULL DEFAULT 0,
    stake BIGINT NOT NULL DEFAULT 0,
    played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, player_id, opponent_id)
);
CREATE INDEX IF NOT EXISTS game_results_chart_idx ON game_results (game, played_at DESC);
CREATE INDEX IF NOT EXISTS game_results_player_idx ON game_results (player_id, opponent_id, played_at DESC);
