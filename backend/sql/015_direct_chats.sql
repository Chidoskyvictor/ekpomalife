-- One-to-one chats between players (alongside hostel group chats).

ALTER TABLE chats DROP CONSTRAINT IF EXISTS chats_kind_check;
ALTER TABLE chats ADD CONSTRAINT chats_kind_check CHECK (kind IN ('hostel', 'direct'));

-- "<smaller user id>:<larger user id>" — at most one direct chat per pair of players.
ALTER TABLE chats ADD COLUMN IF NOT EXISTS direct_key TEXT UNIQUE;

-- "Message someone: @user" — prefix search on usernames.
CREATE INDEX IF NOT EXISTS users_username_prefix_idx ON users (LOWER(username) text_pattern_ops);
