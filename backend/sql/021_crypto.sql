-- Crypto: coins launched by players, traded on a constant-product curve (virtual reserves).
-- "Outside" trades are the market's own buyers/sellers driven by hype (character_id NULL).

CREATE TABLE IF NOT EXISTS coins (
    id TEXT PRIMARY KEY,
    ticker TEXT NOT NULL UNIQUE,
    name VARCHAR(24) NOT NULL,
    emoji TEXT NOT NULL,
    description VARCHAR(140) NOT NULL DEFAULT '',
    creator_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    -- Curve state: price = naira_reserve / token_reserve
    naira_reserve DOUBLE PRECISION NOT NULL,
    token_reserve DOUBLE PRECISION NOT NULL,
    -- Tokens held by outside (market) buyers, which dumps can sell
    outside_tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
    hype DOUBLE PRECISION NOT NULL DEFAULT 0,
    creator_unlock_at TIMESTAMPTZ NOT NULL,
    last_tick_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coin_holdings (
    coin_id TEXT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    tokens DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- Naira spent minus naira taken out, for profit/loss
    cost BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (coin_id, character_id)
);

CREATE TABLE IF NOT EXISTS coin_trades (
    id BIGSERIAL PRIMARY KEY,
    coin_id TEXT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
    side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    outside BOOLEAN NOT NULL DEFAULT FALSE,
    naira BIGINT NOT NULL,
    tokens DOUBLE PRECISION NOT NULL,
    price_after DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coin_trades_coin_idx ON coin_trades (coin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coin_trades_outside_idx ON coin_trades (created_at) WHERE outside = TRUE;

CREATE TABLE IF NOT EXISTS coin_follows (
    coin_id TEXT NOT NULL REFERENCES coins(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (coin_id, user_id)
);
