-- Convoys: a drive together, hosted and joined like a drag race (same table, same invites and voice room),
-- but no stake and no winner: it ends when the leader (the host) gets there.
ALTER TABLE car_races ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'race';
