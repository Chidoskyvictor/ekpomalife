-- In-game chat (typed, per match/table) lives in memory only. When a player reports a line we keep a
-- copy of just that line here so an admin can read it after the match is gone.
CREATE TABLE IF NOT EXISTS game_chat_reports (
    id BIGSERIAL PRIMARY KEY,
    room_key TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    body VARCHAR(200) NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (room_key, reporter_id, sent_at, sender_name)
);
CREATE INDEX IF NOT EXISTS game_chat_reports_created_idx ON game_chat_reports (created_at DESC);
