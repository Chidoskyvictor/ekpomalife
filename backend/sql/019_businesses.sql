-- Invest app, phase 2: small businesses you own and stakes in Ekpoma places (catalogue in invest.ts).
CREATE TABLE IF NOT EXISTS business_holdings (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    business_id TEXT NOT NULL,
    bought_price BIGINT NOT NULL,
    bought_day INT NOT NULL,
    last_paid_day INT NOT NULL,
    earned BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS business_holdings_character_idx ON business_holdings (character_id);
CREATE INDEX IF NOT EXISTS business_holdings_business_idx ON business_holdings (business_id);
