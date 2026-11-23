-- A race on a named route (sprint or circuit): the finish is then checked against the route's checkpoints
-- (backend/src/game/race-trials-rules.ts), not just "are you at the finish". NULL = a free-form drag race.
ALTER TABLE car_races ADD COLUMN IF NOT EXISTS course_id TEXT;
