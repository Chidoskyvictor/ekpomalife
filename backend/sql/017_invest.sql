-- Invest app, phase 1: land plots and rides (okada, keke, shuttle bus).
-- Catalogue (areas, vehicle kinds, prices) lives in code: backend/src/game/invest.ts.

CREATE TABLE IF NOT EXISTS land_holdings (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    area_id TEXT NOT NULL,
    bought_price BIGINT NOT NULL,
    -- Current worth; grows once per owner game day
    value BIGINT NOT NULL,
    -- Owner game day the value was last grown to
    last_day INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS land_holdings_character_idx ON land_holdings (character_id);
CREATE INDEX IF NOT EXISTS land_holdings_area_idx ON land_holdings (area_id, created_at);

CREATE TABLE IF NOT EXISTS ride_holdings (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    bought_price BIGINT NOT NULL,
    bought_day INT NOT NULL,
    -- Last owner game day whose 6 PM payout was paid
    last_paid_day INT NOT NULL,
    earned BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ride_holdings_character_idx ON ride_holdings (character_id);

-- Daily gains and losses (land growth, ride payouts, repairs, agent fees) for Today / This week / Total.
CREATE TABLE IF NOT EXISTS invest_events (
    id BIGSERIAL PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    game_day INT NOT NULL,
    kind TEXT NOT NULL,
    amount BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invest_events_character_day_idx ON invest_events (character_id, game_day);
