-- Phone → Music: one heart per player per track, and a stream log (a stream counts once per player per track per hour).
CREATE TABLE IF NOT EXISTS music_likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, track_id)
);
CREATE INDEX IF NOT EXISTS music_likes_track_idx ON music_likes (track_id);

CREATE TABLE IF NOT EXISTS music_streams (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS music_streams_track_idx ON music_streams (track_id);
CREATE INDEX IF NOT EXISTS music_streams_user_track_idx ON music_streams (user_id, track_id, created_at DESC);

-- The new Music app: show the NEW pill until a player opens it.
UPDATE phone_state SET new_apps = array_append(new_apps, 'music') WHERE NOT ('music' = ANY (new_apps));
ALTER TABLE phone_state ALTER COLUMN new_apps SET DEFAULT ARRAY['ride', 'calendar', 'games', 'music'];
