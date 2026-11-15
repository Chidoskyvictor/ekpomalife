-- Tic tac toe: every move played so far (all rounds), so a server restart can rebuild the board.
ALTER TABLE game_matches ADD COLUMN IF NOT EXISTS ttt_moves jsonb;
