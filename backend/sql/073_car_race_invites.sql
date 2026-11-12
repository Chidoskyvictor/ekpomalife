-- Drag race invitations: players the host asked by name (the race shows as an invitation for them).
CREATE TABLE IF NOT EXISTS car_race_invites (
    race_id TEXT NOT NULL REFERENCES car_races(id) ON DELETE CASCADE,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (race_id, character_id)
);
