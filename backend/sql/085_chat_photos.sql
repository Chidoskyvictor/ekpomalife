-- View-once photos in direct chats. The image bytes live in object storage (R2); this table and the message
-- row hold only metadata. status: sent -> opened (object deleted at once) | reported (kept hidden 30 days) | expired (7-day sweep).
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money', 'game', 'nudge', 'bae', 'voice', 'photo'));

CREATE TABLE IF NOT EXISTS chat_photos (
    message_seq BIGINT PRIMARY KEY REFERENCES chat_messages(seq) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    object_key TEXT,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'opened', 'reported', 'expired', 'purged')),
    bytes INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    opened_at TIMESTAMPTZ,
    opened_by TEXT,
    held_key TEXT,
    held_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chat_photos_sweep_idx ON chat_photos (status, created_at);
