-- Campus Spaces: live voice rooms. Audio runs between players and LiveKit Cloud;
-- we only hand out tokens and keep the room records here. Nothing is ever recorded.

CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(60) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
    -- hostel, faculty, SUG building or other venue (places.ts id, venue id or hostels.id)
    place_id TEXT,
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'link', 'invite')),
    join_code CHAR(6) NOT NULL UNIQUE,
    scheduled_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    max_listeners INTEGER NOT NULL DEFAULT 50 CHECK (max_listeners BETWEEN 1 AND 50),
    ask_to_speak BOOLEAN NOT NULL DEFAULT TRUE,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'ended')),
    -- Hard cap for this room once live: 60, or less when the daily minutes budget is nearly spent
    cap_minutes INTEGER NOT NULL DEFAULT 60 CHECK (cap_minutes BETWEEN 1 AND 60),
    end_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS spaces_status_idx ON spaces (status, scheduled_at);
CREATE INDEX IF NOT EXISTS spaces_host_created_idx ON spaces (host_id, created_at DESC);
CREATE INDEX IF NOT EXISTS spaces_place_live_idx ON spaces (place_id) WHERE status = 'live';
CREATE INDEX IF NOT EXISTS spaces_started_idx ON spaces (started_at) WHERE started_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS space_reports (
    id TEXT PRIMARY KEY,
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (space_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS space_bans (
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, user_id)
);

-- Who is in a room right now (and who asked to speak). Drives speaker approval,
-- the max-listeners cap, auto-end, and the "no money moves while you're live" rule.
CREATE TABLE IF NOT EXISTS space_members (
    space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'listener' CHECK (role IN ('host', 'speaker', 'listener')),
    speak_requested_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS space_members_present_idx ON space_members (user_id) WHERE left_at IS NULL;
