-- "What should they do?" menu (tap yourself at home): when each self action was last done,
-- so the server can enforce its cooldown (no farming skills or money). Skills reuse
-- character_skills (050); Music and Comedy are new skill ids (text column, nothing to alter).
CREATE TABLE IF NOT EXISTS self_action_cooldowns (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    action_id TEXT NOT NULL,
    last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, action_id)
);
