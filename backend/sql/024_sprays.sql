-- Money sprayed in a club: the sprayer pays the whole amount up front, it rains down as
-- notes on everyone in their crowd group, and each note can be picked exactly once.
-- Notes nobody catches before ends_at stay with the club.
CREATE TABLE IF NOT EXISTS venue_sprays (
    id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    night_key BIGINT NOT NULL,
    group_no INTEGER NOT NULL,
    sprayer_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS venue_spray_notes (
    spray_id TEXT NOT NULL REFERENCES venue_sprays(id) ON DELETE CASCADE,
    note_no INTEGER NOT NULL,
    value BIGINT NOT NULL CHECK (value > 0),
    picked_by TEXT REFERENCES characters(id) ON DELETE SET NULL,
    picked_at TIMESTAMPTZ,
    PRIMARY KEY (spray_id, note_no)
);
