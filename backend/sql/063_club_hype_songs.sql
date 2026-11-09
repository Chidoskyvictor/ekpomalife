-- Club hype (pay to hype another player / buy a round / shut down the club) and the
-- admin-managed "promoted songs" shown on the club LED screen. Players cannot add songs.

CREATE TABLE IF NOT EXISTS club_hypes (
    id TEXT PRIMARY KEY,
    venue_id TEXT NOT NULL,
    night_key BIGINT NOT NULL,
    tier TEXT NOT NULL,
    from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    amount BIGINT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS club_hypes_from_idx ON club_hypes (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS club_hypes_pair_idx ON club_hypes (from_user_id, to_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS promoted_songs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    artist TEXT NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 120),
    link_url TEXT NOT NULL CHECK (link_url ~ '^https://' AND char_length(link_url) <= 500),
    cover_url TEXT CHECK (cover_url IS NULL OR (cover_url ~ '^https://' AND char_length(cover_url) <= 500)),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No seed rows: songs are added by an admin in /admin/songs. (The dev database has three
-- example.com placeholder rows for testing; they are not created here so production starts empty.)
