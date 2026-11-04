-- Buy mode furniture with real 3D models (public/models/furniture/*.glb). Only items with a model
-- are sold; the old block-drawn items stay in the table (players may already have them placed,
-- and those keep showing) but are no longer for sale.
ALTER TABLE home_furniture ADD COLUMN IF NOT EXISTS model TEXT;
ALTER TABLE home_furniture ADD COLUMN IF NOT EXISTS available BOOLEAN NOT NULL DEFAULT TRUE;

INSERT INTO home_furniture (id, name, emoji, category, price, w, d, wall, height, color, helps, uses, max_per_home, sort, model) VALUES
  ('family-bed', 'Family bed', '🛏️', 'sleep', 120000, 3, 4, FALSE, 1.05, '#a9744f', ARRAY['Energy','Fun']::text[], 'bed', 1, 0, '/models/furniture/family-bed.glb'),
  ('wine-fridge', 'Wine fridge', '🍷', 'kitchen', 150000, 1, 1, FALSE, 0.9, '#1f2937', ARRAY['Hunger','Fun']::text[], NULL, 1, 1, '/models/furniture/wine-fridge.glb'),
  ('fan', 'Standing fan', '🌀', 'comfort', 9500, 2, 2, FALSE, 1.45, '#9ca3af', ARRAY['Energy']::text[], NULL, 2, 2, '/models/furniture/standing-fan.glb')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, emoji = EXCLUDED.emoji, category = EXCLUDED.category, price = EXCLUDED.price,
    w = EXCLUDED.w, d = EXCLUDED.d, wall = EXCLUDED.wall, height = EXCLUDED.height, color = EXCLUDED.color,
    helps = EXCLUDED.helps, uses = EXCLUDED.uses, max_per_home = EXCLUDED.max_per_home, sort = EXCLUDED.sort,
    model = EXCLUDED.model, available = TRUE;

-- Not sold without a real model (starter furniture is never sold anyway)
UPDATE home_furniture SET available = FALSE WHERE model IS NULL AND starter = FALSE;
