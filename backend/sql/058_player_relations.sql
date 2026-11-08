-- Player-to-player interactions at home: relationship points, partner opt-ins, blocks, reports,
-- and per-pair action cooldowns. Rewards are applied server-side (backend/src/game/interactions.ts).

-- One row per pair (a_id < b_id): points grow with friendly interactions
CREATE TABLE IF NOT EXISTS player_relations (
    a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

-- "I'm open to being partners with them". Romantic actions need BOTH directions.
CREATE TABLE IF NOT EXISTS partner_optins (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    with_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, with_id),
    CHECK (user_id <> with_id)
);

CREATE TABLE IF NOT EXISTS player_blocks (
    blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS player_reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Last time actor did action to target (cooldowns)
CREATE TABLE IF NOT EXISTS player_interaction_log (
    actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (actor_id, target_id, action_id)
);
