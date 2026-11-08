-- Pieces a style (or you) puts away: they stay yours but leave the room until you place them again.
-- A stored piece is a home_placements row with stored = TRUE (x, z, rot are where it last stood).
-- Additive: old rows are not stored.
ALTER TABLE home_placements ADD COLUMN IF NOT EXISTS stored BOOLEAN NOT NULL DEFAULT FALSE;
