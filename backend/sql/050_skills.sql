-- Skills (levels 0-10 from XP). Everyone starts at 0: a missing row means 0 XP.
CREATE TABLE IF NOT EXISTS character_skills (
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (character_id, skill)
);

-- Jobs now ask for skill levels (the old "study need 70" tutor rule becomes Academics 4)
UPDATE jobs SET requirements = '{"skill":"cooking","level":1}'::jsonb WHERE id = 'mama-put-helper';
UPDATE jobs SET requirements = '{"skill":"hustle","level":1}'::jsonb WHERE id = 'pos-agent';
UPDATE jobs SET requirements = '{"skill":"tech","level":2}'::jsonb WHERE id = 'cyber-cafe';
UPDATE jobs SET requirements = '{"skill":"academics","level":4}'::jsonb WHERE id = 'tutor';
UPDATE jobs SET requirements = '{"skill":"hustle","level":2,"item":"keke-licence"}'::jsonb WHERE id = 'keke-rider';
