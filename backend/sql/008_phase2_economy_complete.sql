-- PHASE 2 complete: rent ladder, weekly payouts, idempotency, lodge deed, hustle lockout
-- Later migrations must REUSE idempotency_keys (do not recreate).

ALTER TABLE rent
    ADD COLUMN IF NOT EXISTS warnings INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_warned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS evicted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS due_game_day INTEGER,
    ADD COLUMN IF NOT EXISTS paid_until_game_day INTEGER,
    ADD COLUMN IF NOT EXISTS message TEXT;

ALTER TABLE game_state
    ADD COLUMN IF NOT EXISTS hustle_lockout_until INTEGER,
    ADD COLUMN IF NOT EXISTS reputation INTEGER NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS pending_toast TEXT;

-- Idempotent weekly grants (allowance, landlord rent income).
CREATE TABLE IF NOT EXISTS payouts (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    game_week INTEGER NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, kind, game_week)
);

CREATE INDEX IF NOT EXISTS payouts_character_kind_idx ON payouts(character_id, kind);

-- Reuse this table in later migrations — do not drop/recreate.
CREATE TABLE IF NOT EXISTS idempotency_keys (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route TEXT NOT NULL,
    key TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, route, key)
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_idx ON idempotency_keys(created_at);

-- Lodge ownership via inventory deed (not an ad-hoc flag).
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
(
  'lodge-deed',
  'Lodge deed',
  '🏡',
  250000,
  'licence',
  'market',
  '{"item":"lodge-deed"}'::jsonb,
  NULL,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  place_id = EXCLUDED.place_id,
  effects = EXCLUDED.effects;
