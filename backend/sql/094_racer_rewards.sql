-- Racing rewards that are not money: racer rank (XP), badges and car upgrades.
-- Upgrades belong to one owned car (selling the car sells them with it); XP and badges belong to the player.
CREATE TABLE IF NOT EXISTS car_upgrades (
    car_id TEXT PRIMARY KEY REFERENCES car_holdings(id) ON DELETE CASCADE,
    engine SMALLINT NOT NULL DEFAULT 0 CHECK (engine BETWEEN 0 AND 3),
    tyres SMALLINT NOT NULL DEFAULT 0 CHECK (tyres BETWEEN 0 AND 3),
    brakes SMALLINT NOT NULL DEFAULT 0 CHECK (brakes BETWEEN 0 AND 3),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS racer_stats (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    xp INT NOT NULL DEFAULT 0 CHECK (xp >= 0),
    wins INT NOT NULL DEFAULT 0,
    races INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS race_badges (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    badge TEXT NOT NULL,
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, badge)
);

-- A time-trial run remembers the car's upgrades (shown beside the time on the board) and its engine level (the server's speed limit for it).
ALTER TABLE race_trials ADD COLUMN IF NOT EXISTS upgrades TEXT NOT NULL DEFAULT 'e0t0b0';
ALTER TABLE race_trials ADD COLUMN IF NOT EXISTS engine_level SMALLINT NOT NULL DEFAULT 0;
