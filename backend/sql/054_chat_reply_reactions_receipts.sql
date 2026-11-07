-- Messages: swipe-to-reply, emoji reactions, delivered/read ticks, and a "Read receipts" switch.
-- Additive only: new nullable/defaulted columns and new tables. Old clients keep working.

-- Reply: the message being quoted (same chat, checked by the API). Cleared if the original is deleted.
ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS reply_to BIGINT REFERENCES chat_messages(seq) ON DELETE SET NULL;

-- One reaction per player per message.
CREATE TABLE IF NOT EXISTS chat_reactions (
    message_id BIGINT NOT NULL REFERENCES chat_messages(seq) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, user_id)
);

-- Per-member markers: newest message their app fetched, and newest message they opened with
-- read receipts on (last_read_seq keeps driving the unread badge whatever the switch says).
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_delivered_seq BIGINT NOT NULL DEFAULT 0;
ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS shared_read_seq BIGINT NOT NULL DEFAULT 0;

-- Existing messages count as delivered and read for everyone who has already read them.
UPDATE chat_members SET last_delivered_seq = last_read_seq, shared_read_seq = last_read_seq
WHERE last_delivered_seq = 0 AND shared_read_seq = 0 AND last_read_seq > 0;

-- Per-player chat preferences (read receipts default on).
CREATE TABLE IF NOT EXISTS chat_prefs (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    read_receipts BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
