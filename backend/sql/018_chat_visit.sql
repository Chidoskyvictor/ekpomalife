-- "@x visited your place" notices in direct chats.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money'));
