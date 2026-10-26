-- Live comments in a Space room. Text only, short, filtered; they go with the room when it's deleted.
CREATE TABLE IF NOT EXISTS space_comments (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body VARCHAR(200) NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS space_comments_room_idx ON space_comments (space_id, created_at);
