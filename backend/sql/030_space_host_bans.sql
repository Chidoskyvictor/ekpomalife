-- Players an admin has barred from hosting Spaces (they can still listen)
CREATE TABLE IF NOT EXISTS space_host_bans (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    banned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
