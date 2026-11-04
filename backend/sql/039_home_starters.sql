-- The furniture each home comes with becomes owned pieces (free) so Buy mode can move or remove
-- them. Starter items never show in the shop. See backend/src/game/home-starters.ts.
ALTER TABLE home_furniture ADD COLUMN IF NOT EXISTS starter BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO home_furniture (id, name, emoji, category, price, w, d, wall, height, color, helps, uses, max_per_home, sort, starter) VALUES
  ('starter-bed', 'Your bed', '🛏️', 'sleep', 0, 3, 4, FALSE, 0.51, '#a9744f', ARRAY['Energy']::text[], 'bed', 1, 100, TRUE),
  ('starter-shelf', 'Your shelf', '🗄️', 'study', 0, 2, 1, FALSE, 2.3, '#8d6e63', ARRAY[]::text[], NULL, 1, 101, TRUE),
  ('starter-desk', 'Your table and chair', '🪑', 'study', 0, 3, 1, FALSE, 0.9, '#a9744f', ARRAY['Study']::text[], 'desk-chair', 1, 102, TRUE),
  ('starter-cooler', 'Your cooler', '🧊', 'kitchen', 0, 2, 1, FALSE, 0.7, '#2f7cf6', ARRAY[]::text[], NULL, 1, 103, TRUE),
  ('starter-drum', 'Your water drum', '🛢️', 'bath', 0, 3, 2, FALSE, 1.1, '#1d4ed8', ARRAY[]::text[], NULL, 1, 104, TRUE),
  ('starter-red-chair', 'Your plastic chair', '🪑', 'comfort', 0, 1, 1, FALSE, 0.52, '#dc2626', ARRAY['Energy','Fun']::text[], 'red-chair', 1, 105, TRUE),
  ('starter-sofa', 'Your sofa', '🛋️', 'comfort', 0, 2, 4, FALSE, 0.65, '#6d4c41', ARRAY['Energy','Fun']::text[], 'sofa', 1, 106, TRUE),
  ('starter-low-table', 'Your low table', '☕', 'comfort', 0, 1, 1, FALSE, 0.45, '#8d6e63', ARRAY[]::text[], NULL, 1, 107, TRUE),
  ('starter-tv', 'Your TV', '📺', 'comfort', 0, 1, 3, FALSE, 1.2, '#111827', ARRAY['Fun']::text[], NULL, 1, 108, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Which home's starter pieces a player was given (moving house swaps them for the new home's)
CREATE TABLE IF NOT EXISTS home_starters (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    lodging_id TEXT NOT NULL,
    seeded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
