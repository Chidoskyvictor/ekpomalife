-- Chat voice notes: the audio lives in object storage (R2); the message body holds its key, length and waveform.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money', 'game', 'nudge', 'bae', 'voice'));
