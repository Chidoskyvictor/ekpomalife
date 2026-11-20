-- Voice privacy: house voice mode (open / friends / private) with an invite list, and private
-- two-person voice calls (ring, accept, hang up). Tokens are only issued server-side to the people allowed.
ALTER TABLE characters ADD COLUMN IF NOT EXISTS house_voice TEXT NOT NULL DEFAULT 'open'
  CHECK (house_voice IN ('open', 'friends', 'private'));

CREATE TABLE IF NOT EXISTS house_voice_invites (
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (owner_id, user_id),
    CHECK (owner_id <> user_id)
);

CREATE TABLE IF NOT EXISTS voice_calls (
    id TEXT PRIMARY KEY,
    caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    callee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'active', 'declined', 'missed', 'ended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    answered_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    CHECK (caller_id <> callee_id)
);
CREATE INDEX IF NOT EXISTS voice_calls_callee_idx ON voice_calls (callee_id, status);
CREATE INDEX IF NOT EXISTS voice_calls_caller_idx ON voice_calls (caller_id, status);
