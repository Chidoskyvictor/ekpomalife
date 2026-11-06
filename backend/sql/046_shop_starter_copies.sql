-- The furniture homes come with (bed, shelf, table and chair, cooler, sofa, low table, TV, plastic
-- chair, water drum) as shop items, so players can buy more. Each has its own model cut out of the
-- home GLBs (scripts/blender/starter-pieces.py); the bed, chairs and sofa keep their actions.
INSERT INTO home_furniture (id, name, emoji, category, price, w, d, wall, height, color, helps, uses, max_per_home, sort, model) VALUES
  ('shop-bed', 'Single bed', '🛏️', 'sleep', 25000, 3, 4, FALSE, 0.51, '#a9744f', ARRAY['Energy']::text[], 'bed', 2, 10, '/models/furniture/shop-bed.glb'),
  ('shop-shelf', 'Wooden shelf', '🗄️', 'study', 8000, 2, 1, FALSE, 2.23, '#8d6e63', ARRAY[]::text[], NULL, 3, 11, '/models/furniture/shop-shelf.glb'),
  ('shop-desk', 'Table and chair', '🪑', 'study', 15000, 3, 2, FALSE, 1.28, '#a9744f', ARRAY['Study']::text[], 'desk-chair', 2, 12, '/models/furniture/shop-desk.glb'),
  ('shop-cooler', 'Cooler', '🧊', 'kitchen', 6000, 2, 1, FALSE, 0.69, '#2f7cf6', ARRAY['Hunger']::text[], NULL, 2, 13, '/models/furniture/shop-cooler.glb'),
  ('shop-drum', 'Water drum and jerrycan', '🛢️', 'bath', 5000, 3, 2, FALSE, 1.13, '#1d4ed8', ARRAY['Hygiene']::text[], NULL, 2, 14, '/models/furniture/shop-drum.glb'),
  ('shop-red-chair', 'Plastic chair', '🪑', 'comfort', 2500, 1, 1, FALSE, 0.52, '#dc2626', ARRAY['Energy','Fun']::text[], 'red-chair', 4, 15, '/models/furniture/shop-red-chair.glb'),
  ('shop-sofa', 'Sofa', '🛋️', 'comfort', 45000, 2, 4, FALSE, 0.88, '#6d4c41', ARRAY['Energy','Fun']::text[], 'sofa', 2, 16, '/models/furniture/shop-sofa.glb'),
  ('shop-low-table', 'Low table and rug', '☕', 'comfort', 12000, 2, 2, FALSE, 0.42, '#8d6e63', ARRAY['Fun']::text[], NULL, 2, 17, '/models/furniture/shop-low-table.glb'),
  ('shop-tv', 'Flat-screen TV', '📺', 'comfort', 60000, 1, 3, FALSE, 1.3, '#111827', ARRAY['Fun']::text[], NULL, 2, 18, '/models/furniture/shop-tv.glb')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, emoji = EXCLUDED.emoji, category = EXCLUDED.category, price = EXCLUDED.price,
    w = EXCLUDED.w, d = EXCLUDED.d, wall = EXCLUDED.wall, height = EXCLUDED.height, color = EXCLUDED.color,
    helps = EXCLUDED.helps, uses = EXCLUDED.uses, max_per_home = EXCLUDED.max_per_home, sort = EXCLUDED.sort,
    model = EXCLUDED.model, available = TRUE;
