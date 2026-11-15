-- Chess online matches: the server plays the referee (validates every move, runs the clocks,
-- decides checkmate / resign / timeout), so the game state lives here, not in the phones.
ALTER TABLE game_matches ADD COLUMN IF NOT EXISTS state JSONB;
