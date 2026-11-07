-- Quick actions done in person (Say Hello, Gist, Joke, Compliment) leave a slim notice in the direct chat.
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money', 'game', 'nudge'));
