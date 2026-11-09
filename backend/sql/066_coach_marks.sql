-- Onboarding: first-time tour progress, one-time tips already shown, tutorial missions state (per character, so it never repeats on another device).
CREATE TABLE IF NOT EXISTS coach_progress (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    tour_step INTEGER NOT NULL DEFAULT 0,
    tour_done BOOLEAN NOT NULL DEFAULT FALSE,
    tutorial_done BOOLEAN NOT NULL DEFAULT FALSE,
    tips_seen TEXT[] NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Everyone who already plays skips the tour and the tutorial missions (they still get each tip once).
INSERT INTO coach_progress (character_id, tour_done, tutorial_done)
SELECT id, TRUE, TRUE FROM characters
ON CONFLICT (character_id) DO NOTHING;
