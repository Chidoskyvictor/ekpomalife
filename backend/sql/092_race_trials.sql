-- Time trials on the named Ekpoma routes. A trial is opened by the server when the player sets off
-- (start time = the server's clock) and closed with the finish time and checkpoint splits, which the
-- server checks against the route before it counts (backend/src/game/race-trials.ts).
CREATE TABLE IF NOT EXISTS race_trials (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    car_model TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'rejected')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    ms INT,
    splits INT[],
    reject_reason TEXT
);
CREATE INDEX IF NOT EXISTS race_trials_board_idx ON race_trials (course_id, ms) WHERE status = 'done';
CREATE INDEX IF NOT EXISTS race_trials_character_idx ON race_trials (character_id, course_id);
