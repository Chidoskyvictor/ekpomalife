-- PHASE 2.5: My Room (hostel interior)
-- Idempotency: REUSE idempotency_keys from 008 — add columns; do not recreate.

ALTER TABLE idempotency_keys
    ADD COLUMN IF NOT EXISTS request_hash TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS response JSONB;

UPDATE idempotency_keys SET response = body WHERE response IS NULL AND body IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_character_key_uidx
    ON idempotency_keys (character_id, key)
    WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS furniture_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    price BIGINT NOT NULL CHECK (price >= 0),
    footprint_w SMALLINT NOT NULL CHECK (footprint_w BETWEEN 1 AND 3),
    footprint_d SMALLINT NOT NULL CHECK (footprint_d BETWEEN 1 AND 3),
    model TEXT NOT NULL,
    comfort JSONB NOT NULL DEFAULT '{}'::jsonb,
    min_tier SMALLINT NOT NULL DEFAULT 1,
    wall_mounted BOOLEAN NOT NULL DEFAULT FALSE,
    max_per_room SMALLINT NOT NULL DEFAULT 1,
    replaces TEXT,
    sort SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS room_items (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES furniture_catalog(id),
    placed BOOLEAN NOT NULL DEFAULT FALSE,
    x SMALLINT NOT NULL DEFAULT 0,
    z SMALLINT NOT NULL DEFAULT 0,
    rotation SMALLINT NOT NULL DEFAULT 0 CHECK (rotation IN (0, 90, 180, 270)),
    is_starter BOOLEAN NOT NULL DEFAULT FALSE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS room_items_character_idx ON room_items(character_id);

CREATE TABLE IF NOT EXISTS room_style (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    wall_color TEXT NOT NULL DEFAULT '#F2EDE4',
    floor_id TEXT NOT NULL DEFAULT 'cement',
    owned_floors TEXT[] NOT NULL DEFAULT ARRAY['cement'],
    version INTEGER NOT NULL DEFAULT 0,
    last_fun_bonus_day INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed catalog (18 rows). ON CONFLICT keeps re-runs safe.
INSERT INTO furniture_catalog (
  id, name, emoji, category, price, footprint_w, footprint_d, model, comfort,
  min_tier, wall_mounted, max_per_room, replaces, sort
) VALUES
('mattress-floor', 'Mattress on the floor', '🛏️', 'sleep', 0, 2, 3, 'primitive:mattress', '{"sleepQuality":3}'::jsonb, 1, FALSE, 1, NULL, 1),
('bed-single', 'Proper single bed', '🛏️', 'sleep', 18000, 2, 3, '/models/room/bedSingle.glb', '{"sleepQuality":8,"happiness":2}'::jsonb, 1, FALSE, 1, 'mattress-floor', 2),
('bed-double', 'Double bed + headboard', '🛏️', 'sleep', 45000, 3, 3, '/models/room/bedDouble.glb', '{"sleepQuality":8,"happiness":5}'::jsonb, 3, FALSE, 1, 'bed-single', 3),
('standing-fan', 'Standing fan', '🌀', 'cooling', 9500, 1, 1, 'primitive:fan', '{"sleepQuality":5}'::jsonb, 1, FALSE, 2, NULL, 4),
('rechargeable-lamp', 'Rechargeable lamp', '🔦', 'light', 4500, 1, 1, 'primitive:lamp-rechargeable', '{"study":4,"happiness":1}'::jsonb, 1, FALSE, 2, NULL, 5),
('gas-cooker', 'Table-top gas cooker', '🔥', 'kitchen', 15000, 2, 1, '/models/room/kitchenStove.glb', '{"happiness":3,"hygiene":2}'::jsonb, 2, FALSE, 1, NULL, 6),
('mini-fridge', 'Mini fridge', '🧊', 'kitchen', 38000, 1, 1, '/models/room/kitchenFridgeSmall.glb', '{"happiness":5}'::jsonb, 2, FALSE, 1, NULL, 7),
('small-gen', 'I better pass my neighbour gen', '⚡', 'power', 55000, 1, 1, 'primitive:gen', '{"sleepQuality":4,"happiness":4,"study":3}'::jsonb, 2, FALSE, 1, NULL, 8),
('plastic-chair', 'Plastic chair', '🪑', 'study', 2500, 1, 1, '/models/room/chair.glb', '{"study":1}'::jsonb, 1, FALSE, 4, NULL, 9),
('reading-table', 'Reading table', '📚', 'study', 8000, 2, 1, '/models/room/tableCoffee.glb', '{"study":6}'::jsonb, 1, FALSE, 1, NULL, 10),
('bucket-set', 'Bucket & bowl set', '🪣', 'storage', 1500, 1, 1, 'primitive:bucket', '{"hygiene":4}'::jsonb, 1, FALSE, 2, NULL, 11),
('ghana-must-go', 'Ghana-must-go bag', '👜', 'storage', 1200, 1, 1, 'primitive:bag', '{"happiness":1}'::jsonb, 1, FALSE, 3, NULL, 12),
('wardrobe', 'Wooden wardrobe', '🚪', 'storage', 22000, 2, 1, '/models/room/bookcaseClosed.glb', '{"happiness":3,"hygiene":2}'::jsonb, 2, FALSE, 1, NULL, 13),
('rug-ankara', 'Ankara rug', '🟫', 'decor', 6000, 2, 2, '/models/room/rugRectangle.glb', '{"happiness":4}'::jsonb, 1, FALSE, 2, NULL, 14),
('poster-afrobeats', 'Afrobeats poster', '🎤', 'decor', 1000, 1, 1, 'primitive:poster', '{"happiness":2}'::jsonb, 1, TRUE, 6, NULL, 15),
('poster-football', 'Super Eagles poster', '⚽', 'decor', 1000, 1, 1, 'primitive:poster', '{"happiness":2}'::jsonb, 1, TRUE, 6, NULL, 16),
('curtain-ankara', 'Ankara curtain', '🪟', 'decor', 3500, 2, 1, 'primitive:curtain', '{"sleepQuality":2,"happiness":2}'::jsonb, 1, TRUE, 2, NULL, 17),
('plant-pot', 'Potted plant', '🪴', 'decor', 2000, 1, 1, '/models/room/pottedPlant.glb', '{"happiness":2}'::jsonb, 1, FALSE, 3, NULL, 18)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  category = EXCLUDED.category,
  price = EXCLUDED.price,
  footprint_w = EXCLUDED.footprint_w,
  footprint_d = EXCLUDED.footprint_d,
  model = EXCLUDED.model,
  comfort = EXCLUDED.comfort,
  min_tier = EXCLUDED.min_tier,
  wall_mounted = EXCLUDED.wall_mounted,
  max_per_room = EXCLUDED.max_per_room,
  replaces = EXCLUDED.replaces,
  sort = EXCLUDED.sort;
