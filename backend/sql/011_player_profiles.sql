-- Player-facing profiles (display name, campus card, public stats)

CREATE TABLE IF NOT EXISTS player_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name VARCHAR(20) NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#3d9ad6',
    avatar_emoji TEXT,
    department TEXT NOT NULL DEFAULT 'Undeclared',
    study_level TEXT NOT NULL DEFAULT '100L'
        CHECK (study_level IN ('100L', '200L', '300L', '400L', '500L')),
    bio VARCHAR(120) NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_display_name_lower_idx
    ON player_profiles (LOWER(display_name));
