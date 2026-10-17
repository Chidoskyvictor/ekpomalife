-- PHASE 2: jobs, shop, inventory, rent, richer ledger

ALTER TABLE ledger
    ADD COLUMN IF NOT EXISTS kind TEXT,
    ADD COLUMN IF NOT EXISTS balance_after BIGINT;

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    place_id TEXT NOT NULL,
    pay_per_shift BIGINT NOT NULL,
    shift_minutes INTEGER NOT NULL,
    needs_cost JSONB NOT NULL DEFAULT '{}'::jsonb,
    requirements JSONB NOT NULL DEFAULT '{}'::jsonb,
    levels JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    price BIGINT NOT NULL,
    category TEXT NOT NULL,
    place_id TEXT NOT NULL,
    effects JSONB NOT NULL DEFAULT '{}'::jsonb,
    use_action_id TEXT,
    stock INTEGER
);

CREATE TABLE IF NOT EXISTS inventory (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES shop_items(id),
    qty INTEGER NOT NULL CHECK (qty >= 0),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, item_id)
);

CREATE TABLE IF NOT EXISTS rent (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    lodging_id TEXT NOT NULL,
    amount BIGINT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    paid_until TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'due',
    label TEXT NOT NULL DEFAULT 'Baba Landlord'
);

CREATE TABLE IF NOT EXISTS player_jobs (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL REFERENCES jobs(id),
    level INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS shop_items_place_id_idx ON shop_items(place_id);
CREATE INDEX IF NOT EXISTS inventory_character_id_idx ON inventory(character_id);
CREATE INDEX IF NOT EXISTS ledger_character_created_idx ON ledger(character_id, created_at DESC);

-- Seed jobs (from lib/game/economy-mock.ts)
INSERT INTO jobs (id, title, place_id, pay_per_shift, shift_minutes, needs_cost, requirements, levels) VALUES
(
  'campus-errand', 'Campus errand', 'admin-block', 500, 30,
  '{"energy":10}'::jsonb, '{}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
),
(
  'pos-agent', 'POS agent', 'town-shop-1', 700, 60,
  '{"energy":15}'::jsonb, '{"level":1}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
),
(
  'mama-put-helper', 'Mama put helper', 'bukka', 600, 45,
  '{"energy":12,"hygiene":5}'::jsonb, '{}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
),
(
  'keke-rider', 'Keke rider', 'keke-park', 1200, 60,
  '{"energy":20}'::jsonb, '{"item":"keke-licence"}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
),
(
  'cyber-cafe', 'Cyber café typist', 'ict-exams', 900, 60,
  '{"energy":12}'::jsonb, '{"trait":"tech"}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
),
(
  'tutor', 'Night tutor', 'admin-block', 1000, 90,
  '{"energy":18,"study":-10}'::jsonb, '{"skill":"study","level":70}'::jsonb,
  '[{"level":1,"title":"Rookie","payBonus":0},{"level":2,"title":"Regular","payBonus":0.1},{"level":3,"title":"Senior","payBonus":0.2}]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  place_id = EXCLUDED.place_id,
  pay_per_shift = EXCLUDED.pay_per_shift,
  shift_minutes = EXCLUDED.shift_minutes,
  needs_cost = EXCLUDED.needs_cost,
  requirements = EXCLUDED.requirements,
  levels = EXCLUDED.levels;

-- Seed shop items (mock catalog + a few extras for variety)
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
('phone-basic', 'Campus phone', '📱', 2500, 'phone', 'town-shop-1', '{"item":"phone"}'::jsonb, NULL, NULL),
('gala-fanta', 'Gala & Fanta', '🌭', 300, 'food', 'town-shop-1', '{"needs":{"hunger":15}}'::jsonb, 'eat', NULL),
('soap', 'Bath soap', '🧼', 400, 'toiletries', 'town-shop-1', '{"needs":{"hygiene":20}}'::jsonb, 'shower', NULL),
('water-sachet', 'Pure water', '💧', 50, 'food', 'town-shop-1', '{"needs":{"hunger":5}}'::jsonb, 'eat', NULL),
('toothbrush', 'Toothbrush', '🪥', 250, 'toiletries', 'town-shop-1', '{"needs":{"hygiene":10}}'::jsonb, 'shower', NULL),
('jollof-plate', 'Plate of jollof', '🍲', 800, 'food', 'bukka', '{"needs":{"hunger":35,"fun":5}}'::jsonb, 'eat', NULL),
('moi-moi', 'Moi moi wrap', '🫔', 350, 'food', 'bukka', '{"needs":{"hunger":18}}'::jsonb, 'eat', NULL),
('zobo', 'Zobo drink', '🧃', 200, 'food', 'bukka', '{"needs":{"hunger":8,"fun":4}}'::jsonb, 'eat', NULL),
('garri', 'Garri & groundnut', '🥜', 400, 'food', 'market', '{"needs":{"hunger":20}}'::jsonb, 'eat', NULL),
('textbook', 'Used textbook', '📚', 1500, 'books', 'market', '{"needs":{"study":15}}'::jsonb, NULL, NULL),
('keke-licence', 'Keke licence', '🪪', 5000, 'licence', 'market', '{"item":"keke-licence"}'::jsonb, NULL, NULL),
('ankara-shirt', 'Ankara shirt', '👕', 3500, 'clothes', 'market', '{"needs":{"fun":8,"social":5}}'::jsonb, NULL, NULL),
('slippers', 'Rubber slippers', '🩴', 800, 'clothes', 'market', '{"needs":{"hygiene":5}}'::jsonb, NULL, NULL),
('notebook', 'Exercise book', '📓', 200, 'books', 'town-shop-1', '{"needs":{"study":5}}'::jsonb, NULL, NULL),
('energy-drink', 'Predator can', '⚡', 500, 'food', 'town-shop-1', '{"needs":{"energy":20,"hunger":5}}'::jsonb, 'eat', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  place_id = EXCLUDED.place_id,
  effects = EXCLUDED.effects,
  use_action_id = EXCLUDED.use_action_id,
  stock = EXCLUDED.stock;
