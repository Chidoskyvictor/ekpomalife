-- AAU school record per character: acceptance fee, the session's two fee installments, the
-- current level and semester, exam prep, today's class counts and every semester result.
-- Rules live in backend/src/game/school-rules.ts.
CREATE TABLE IF NOT EXISTS school_state (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 100 CHECK (level >= 100),
    semester SMALLINT NOT NULL DEFAULT 1 CHECK (semester IN (1, 2)),
    acceptance_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_1 BOOLEAN NOT NULL DEFAULT FALSE,
    paid_2 BOOLEAN NOT NULL DEFAULT FALSE,
    prep INTEGER NOT NULL DEFAULT 0 CHECK (prep BETWEEN 0 AND 100),
    lectures_semester INTEGER NOT NULL DEFAULT 0,
    last_lecture_day INTEGER,
    counts_day INTEGER,
    lectures_today INTEGER NOT NULL DEFAULT 0,
    tutorials_today INTEGER NOT NULL DEFAULT 0,
    last_class_at TIMESTAMPTZ,
    results JSONB NOT NULL DEFAULT '[]'::jsonb,
    graduated BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
