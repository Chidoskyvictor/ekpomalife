-- ẹta as a Twitter/X-style feed: reposts, view counts and one optional photo per post.
-- Photos are small shrunk WebP/JPEG blobs (<= 300KB) served with long cache headers from /eta/photos/:id.
CREATE TABLE IF NOT EXISTS eta_photos (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime TEXT NOT NULL CHECK (mime IN ('image/webp', 'image/jpeg')),
    data BYTEA NOT NULL,
    w INT NOT NULL DEFAULT 4,
    h INT NOT NULL DEFAULT 3,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE eta_posts ADD COLUMN IF NOT EXISTS repost_count INT NOT NULL DEFAULT 0;
ALTER TABLE eta_posts ADD COLUMN IF NOT EXISTS view_count INT NOT NULL DEFAULT 0;
ALTER TABLE eta_posts ADD COLUMN IF NOT EXISTS photo_id BIGINT REFERENCES eta_photos(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS eta_reposts (
    post_id BIGINT NOT NULL REFERENCES eta_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);
