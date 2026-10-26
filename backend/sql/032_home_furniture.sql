-- Buy mode at home: furniture you buy with in-game naira and place on a tile grid in your own home.
-- Tiles are 0.6 m. Footprints are in tiles before rotation; wall items sit on the back wall row only.
-- Separate from the older room_items / furniture_catalog (the 2.5D room editor), which stays as it is.

CREATE TABLE IF NOT EXISTS home_furniture (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL CHECK (category IN ('sleep', 'kitchen', 'bath', 'comfort', 'study', 'light', 'deco')),
    price BIGINT NOT NULL CHECK (price >= 0),
    w SMALLINT NOT NULL CHECK (w BETWEEN 1 AND 4),
    d SMALLINT NOT NULL CHECK (d BETWEEN 1 AND 4),
    wall BOOLEAN NOT NULL DEFAULT FALSE,
    -- Drawn height in metres and colour (no models yet: pieces are drawn as simple blocks)
    height REAL NOT NULL DEFAULT 0.6,
    color TEXT NOT NULL DEFAULT '#b08d5b',
    -- Which needs it helps (shown on the card): Energy, Hunger, Hygiene, Fun, Study
    helps TEXT[] NOT NULL DEFAULT '{}',
    -- Existing furniture actions it gives (room-furniture.ts id: bed, red-chair, desk-chair, sofa, bucket, cooker, toilet)
    uses TEXT,
    max_per_home SMALLINT NOT NULL DEFAULT 1 CHECK (max_per_home >= 1),
    sort SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS home_placements (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES home_furniture(id),
    x SMALLINT NOT NULL CHECK (x >= 0),
    z SMALLINT NOT NULL CHECK (z >= 0),
    rot SMALLINT NOT NULL DEFAULT 0 CHECK (rot IN (0, 90, 180, 270)),
    -- What it cost, so selling back pays 50% of this even if the price changes later
    paid BIGINT NOT NULL CHECK (paid >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS home_placements_character_idx ON home_placements (character_id);

INSERT INTO home_furniture (id, name, emoji, category, price, w, d, wall, height, color, helps, uses, max_per_home, sort) VALUES
  ('mattress', 'Foam mattress', '🛏️', 'sleep', 8000, 2, 3, FALSE, 0.25, '#8aa6c1', ARRAY['Energy']::text[], 'bed', 1, 0),
  ('bed-single', 'Single bed', '🛏️', 'sleep', 35000, 2, 4, FALSE, 0.5, '#a9744f', ARRAY['Energy']::text[], 'bed', 1, 1),
  ('bed-double', 'Double bed', '🛏️', 'sleep', 90000, 3, 4, FALSE, 0.55, '#7d5a45', ARRAY['Energy','Fun']::text[], 'bed', 1, 2),
  ('bedside-stool', 'Bedside stool', '🪑', 'sleep', 1800, 1, 1, FALSE, 0.45, '#b08d5b', ARRAY[]::text[], NULL, 2, 3),
  ('kerosene-stove', 'Kerosene stove', '🔥', 'kitchen', 4500, 1, 1, FALSE, 0.4, '#6b7280', ARRAY['Hunger']::text[], 'cooker', 1, 4),
  ('gas-cooker', 'Table-top gas cooker', '🍳', 'kitchen', 28000, 2, 1, FALSE, 0.8, '#cfd4da', ARRAY['Hunger']::text[], 'cooker', 1, 5),
  ('mini-fridge', 'Mini fridge', '🧊', 'kitchen', 65000, 1, 1, FALSE, 1.0, '#e5e7eb', ARRAY['Hunger']::text[], NULL, 1, 6),
  ('deep-freezer', 'Deep freezer', '❄️', 'kitchen', 200000, 2, 1, FALSE, 0.9, '#f3f4f6', ARRAY['Hunger','Fun']::text[], NULL, 1, 7),
  ('kitchen-shelf', 'Kitchen shelf', '🥣', 'kitchen', 3500, 2, 1, TRUE, 0.5, '#b08d5b', ARRAY['Hunger']::text[], NULL, 2, 8),
  ('bucket', 'Bucket', '🪣', 'bath', 600, 1, 1, FALSE, 0.35, '#2f7cf6', ARRAY['Hygiene']::text[], 'bucket', 2, 9),
  ('bucket-bowl', 'Bucket & bowl set', '🛁', 'bath', 1500, 1, 1, FALSE, 0.4, '#f59e0b', ARRAY['Hygiene']::text[], 'bucket', 1, 10),
  ('water-closet', 'Water closet (WC)', '🚽', 'bath', 45000, 1, 1, FALSE, 0.5, '#f9fafb', ARRAY['Hygiene']::text[], 'toilet', 1, 11),
  ('wash-basin', 'Wash-hand basin', '🚰', 'bath', 12000, 1, 1, FALSE, 0.8, '#e5e7eb', ARRAY['Hygiene']::text[], NULL, 1, 12),
  ('bath-mirror', 'Bathroom mirror', '🪞', 'bath', 2500, 1, 1, TRUE, 0.6, '#bcd6e6', ARRAY['Hygiene']::text[], NULL, 2, 13),
  ('towel-hook', 'Towel hook', '🧺', 'bath', 300, 1, 1, TRUE, 0.3, '#9ca3af', ARRAY['Hygiene']::text[], NULL, 3, 14),
  ('plastic-chair', 'Plastic chair', '🪑', 'comfort', 1200, 1, 1, FALSE, 0.5, '#dc2626', ARRAY['Energy','Fun']::text[], 'red-chair', 4, 15),
  ('sofa', 'Three-seater sofa', '🛋️', 'comfort', 55000, 3, 1, FALSE, 0.65, '#6d4c41', ARRAY['Energy','Fun']::text[], 'sofa', 1, 16),
  ('standing-fan', 'Standing fan', '🌀', 'comfort', 9500, 1, 1, FALSE, 1.2, '#9ca3af', ARRAY['Energy']::text[], NULL, 2, 17),
  ('wall-fan', 'Wall fan', '🌬️', 'comfort', 14000, 1, 1, TRUE, 0.5, '#d1d5db', ARRAY['Energy']::text[], NULL, 2, 18),
  ('split-ac', 'Split AC', '❄️', 'comfort', 185000, 2, 1, TRUE, 0.4, '#f9fafb', ARRAY['Energy','Fun']::text[], NULL, 1, 19),
  ('ghana-must-go', 'Ghana-must-go bag', '👜', 'comfort', 400, 1, 1, FALSE, 0.4, '#2563eb', ARRAY[]::text[], NULL, 3, 20),
  ('reading-table', 'Reading table', '📚', 'study', 8000, 2, 1, FALSE, 0.75, '#a9744f', ARRAY['Study']::text[], NULL, 1, 21),
  ('study-chair', 'Study chair', '🪑', 'study', 6000, 1, 1, FALSE, 0.55, '#7d5a45', ARRAY['Study','Energy']::text[], 'desk-chair', 2, 22),
  ('bookshelf', 'Bookshelf', '📖', 'study', 14000, 2, 1, FALSE, 1.4, '#8d6e63', ARRAY['Study']::text[], NULL, 2, 23),
  ('whiteboard', 'Whiteboard', '📝', 'study', 3200, 2, 1, TRUE, 0.8, '#f9fafb', ARRAY['Study']::text[], NULL, 1, 24),
  ('rechargeable-lamp', 'Rechargeable lamp', '🔦', 'light', 4500, 1, 1, FALSE, 0.35, '#facc15', ARRAY['Study']::text[], NULL, 3, 25),
  ('lantern', 'Hurricane lantern', '🏮', 'light', 1100, 1, 1, FALSE, 0.3, '#f59e0b', ARRAY[]::text[], NULL, 3, 26),
  ('wall-bulb', 'Wall bulb', '💡', 'light', 700, 1, 1, TRUE, 0.2, '#fde68a', ARRAY[]::text[], NULL, 4, 27),
  ('small-gen', 'Small generator', '⚡', 'light', 120000, 1, 1, FALSE, 0.6, '#dc2626', ARRAY['Energy','Fun','Study']::text[], NULL, 1, 28),
  ('poster-afrobeats', 'Afrobeats poster', '🎤', 'deco', 1000, 1, 1, TRUE, 0.8, '#7c3aed', ARRAY['Fun']::text[], NULL, 4, 29),
  ('poster-eagles', 'Super Eagles poster', '⚽', 'deco', 1000, 1, 1, TRUE, 0.8, '#16a34a', ARRAY['Fun']::text[], NULL, 4, 30),
  ('ankara-curtain', 'Ankara curtain', '🪟', 'deco', 3500, 2, 1, TRUE, 1.0, '#ea580c', ARRAY['Energy','Fun']::text[], NULL, 2, 31),
  ('potted-plant', 'Potted plant', '🪴', 'deco', 2000, 1, 1, FALSE, 0.7, '#16a34a', ARRAY['Fun']::text[], NULL, 3, 32),
  ('wall-clock', 'Wall clock', '🕒', 'deco', 1800, 1, 1, TRUE, 0.4, '#f3f4f6', ARRAY[]::text[], NULL, 1, 33),
  ('framed-photo', 'Framed photo', '🖼️', 'deco', 2500, 1, 1, TRUE, 0.5, '#b45309', ARRAY['Fun']::text[], NULL, 3, 34)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, emoji = EXCLUDED.emoji, category = EXCLUDED.category, price = EXCLUDED.price,
    w = EXCLUDED.w, d = EXCLUDED.d, wall = EXCLUDED.wall, height = EXCLUDED.height, color = EXCLUDED.color,
    helps = EXCLUDED.helps, uses = EXCLUDED.uses, max_per_home = EXCLUDED.max_per_home, sort = EXCLUDED.sort;
