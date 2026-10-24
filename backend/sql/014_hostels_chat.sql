-- Hostels (real off-campus hostels, created by players, shared) + hostel group chat.

-- Fuzzy hostel search when the extension is available (Neon has it); ILIKE works without it.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm unavailable — hostel search falls back to ILIKE';
END $$;

CREATE TABLE IF NOT EXISTS hostels (
    id TEXT PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    -- lowercase, no punctuation, no "hostel", "saint" → "st" (see normalizeHostelName)
    normalized_name TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hostels_created_by_idx ON hostels (created_by, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS hostels_normalized_trgm_idx ON hostels USING gin (normalized_name gin_trgm_ops)';
  END IF;
END $$;

-- One hostel per player (user_id UNIQUE).
CREATE TABLE IF NOT EXISTS hostel_members (
    hostel_id TEXT NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (hostel_id, user_id)
);

CREATE INDEX IF NOT EXISTS hostel_members_hostel_idx ON hostel_members (hostel_id, joined_at);

-- Group chats. Only hostel chats for now; `kind` leaves room for more.
CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('hostel')),
    hostel_id TEXT UNIQUE REFERENCES hostels(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Highest message seq this member has seen (unread = newer messages from others)
    last_read_seq BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (chat_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_members_user_idx ON chat_members (user_id);

-- `seq` is the message id and the paging cursor (strictly increasing).
CREATE TABLE IF NOT EXISTS chat_messages (
    seq BIGSERIAL PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    -- NULL for system messages ("X joined …")
    sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text', 'system')),
    body VARCHAR(500) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_messages_chat_seq_idx ON chat_messages (chat_id, seq DESC);
CREATE INDEX IF NOT EXISTS chat_messages_sender_time_idx ON chat_messages (sender_id, created_at);

-- A report hides the message from the reporter right away; kept for moderation.
CREATE TABLE IF NOT EXISTS chat_reports (
    message_seq BIGINT NOT NULL REFERENCES chat_messages(seq) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_seq, reporter_id)
);
