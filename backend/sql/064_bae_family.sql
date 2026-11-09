-- Bae & Family step 1: closeness log, baes (up to 4, one can be a sneaky link), relatives,
-- consent requests (shared by "bae" and "relative"), small notification events, privacy.

-- Per-pair throttle for closeness points earned from chats / visits / dates (points live in player_relations)
CREATE TABLE IF NOT EXISTS closeness_log (
    a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    last_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (a_id, b_id, kind),
    CHECK (a_id < b_id)
);

-- One row per couple (a_id < b_id). sneaky_by_a: a marked b as their secret "sneaky link" (and vice versa).
CREATE TABLE IF NOT EXISTS bae_pairs (
    a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sneaky_by_a BOOLEAN NOT NULL DEFAULT FALSE,
    sneaky_by_b BOOLEAN NOT NULL DEFAULT FALSE,
    dates INTEGER NOT NULL DEFAULT 0,
    hangouts INTEGER NOT NULL DEFAULT 0,
    cozy INTEGER NOT NULL DEFAULT 0,
    anniversaries INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

-- Relatives (sibling / cousin / parent / uncle_aunt). role_of_b: what b is to a ("parent" = b is a's parent).
CREATE TABLE IF NOT EXISTS relatives (
    a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_of_b TEXT NOT NULL CHECK (role_of_b IN ('sibling', 'cousin', 'parent', 'child', 'uncle_aunt', 'niece_nephew')),
    since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

-- A request needs the other player's yes. relation = what the receiver is to the sender (relatives only).
CREATE TABLE IF NOT EXISTS family_requests (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('bae', 'relative')),
    relation TEXT,
    from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    answered_at TIMESTAMPTZ,
    CHECK (from_id <> to_id)
);
CREATE INDEX IF NOT EXISTS family_requests_to_idx ON family_requests (to_id, status);
CREATE INDEX IF NOT EXISTS family_requests_from_idx ON family_requests (from_id, status);

-- Phone notifications (accepted, broke up, caught...). seen = shown once in the Family app.
CREATE TABLE IF NOT EXISTS family_events (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    body TEXT NOT NULL,
    seen BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS family_events_user_idx ON family_events (user_id, seen, created_at DESC);

-- Privacy: hide "In a relationship / Single" on your card
CREATE TABLE IF NOT EXISTS family_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    hide_status BOOLEAN NOT NULL DEFAULT FALSE
);

-- The centred request card in the direct chat (body = request id)
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_kind_check;
ALTER TABLE chat_messages
    ADD CONSTRAINT chat_messages_kind_check CHECK (kind IN ('text', 'system', 'sticker', 'invite', 'visit', 'money', 'game', 'nudge', 'bae'));
