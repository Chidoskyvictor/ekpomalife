-- Bath and kitchen pieces (toilet, bucket, cooker…) become starter furniture too, so Buy mode can
-- move or remove them. Additive only. See backend/src/game/home-starters.ts.

-- The cooker and counter is 5 tiles deep; 032 capped depth at 4.
ALTER TABLE home_furniture DROP CONSTRAINT IF EXISTS home_furniture_d_check;
ALTER TABLE home_furniture ADD CONSTRAINT home_furniture_d_check CHECK (d BETWEEN 1 AND 6);
INSERT INTO home_furniture (id, name, emoji, category, price, w, d, wall, height, color, helps, uses, max_per_home, sort, starter) VALUES
  ('starter-toilet', 'Your toilet', '🚽', 'bath', 0, 1, 1, FALSE, 1.05, '#f5f5f4', ARRAY['Hygiene']::text[], 'toilet', 1, 109, TRUE),
  ('starter-bucket', 'Your bucket and basin', '🪣', 'bath', 0, 1, 2, FALSE, 0.7, '#2563eb', ARRAY['Hygiene']::text[], 'bucket', 1, 110, TRUE),
  ('starter-cooker', 'Your cooker and counter', '🍳', 'kitchen', 0, 1, 5, FALSE, 1.35, '#9ca3af', ARRAY['Hunger']::text[], 'cooker', 1, 111, TRUE),
  ('starter-gas', 'Your gas bottle', '🧯', 'kitchen', 0, 1, 1, FALSE, 0.6, '#dc2626', ARRAY[]::text[], NULL, 1, 112, TRUE),
  ('starter-barrel', 'Your water barrel', '🛢️', 'bath', 0, 1, 1, FALSE, 1.1, '#1d4ed8', ARRAY[]::text[], NULL, 1, 113, TRUE),
  ('starter-jerrycans', 'Your jerrycans', '🧴', 'kitchen', 0, 1, 1, FALSE, 0.6, '#eab308', ARRAY[]::text[], NULL, 1, 114, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Which starter items a player has ever been given in their current home. NULL = seeded before
-- this column existed (the first nine starters). A removed piece stays listed, so it is never
-- given back; a newer starter that is not listed gets added once.
ALTER TABLE home_starters ADD COLUMN IF NOT EXISTS items TEXT[];
