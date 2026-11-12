-- Player-owned cars (Magmus Autos dealership) and paid parking spaces for homes with no room.
CREATE TABLE IF NOT EXISTS car_holdings (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    color TEXT NOT NULL,
    bought_price BIGINT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT FALSE,
    dents INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS car_holdings_character_idx ON car_holdings (character_id);

CREATE TABLE IF NOT EXISTS parking_spaces (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    paid BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
