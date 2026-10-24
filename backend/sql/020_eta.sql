-- ẹta: Ekpoma's own social feed. Players and NPCs post "gists"; likes, replies, follows, giveaways.
-- NPC profiles live in code (backend/src/game/eta-npcs.ts); posts reference them by id.

CREATE TABLE IF NOT EXISTS eta_posts (
    id BIGSERIAL PRIMARY KEY,
    author_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    author_npc_id TEXT,
    body VARCHAR(280) NOT NULL,
    -- Lower-case tags pulled from the text: coin tickers ($JOLLOF → jollof) and Ekpoma places
    tags TEXT[] NOT NULL DEFAULT '{}',
    reply_to BIGINT REFERENCES eta_posts(id) ON DELETE CASCADE,
    like_count INT NOT NULL DEFAULT 0,
    reply_count INT NOT NULL DEFAULT 0,
    -- Giveaways (NPC posts only): most-liked reply when it ends wins the prize
    giveaway_prize BIGINT,
    giveaway_ends_at TIMESTAMPTZ,
    giveaway_winner_post BIGINT,
    giveaway_settled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((author_user_id IS NULL) <> (author_npc_id IS NULL))
);

CREATE INDEX IF NOT EXISTS eta_posts_feed_idx ON eta_posts (created_at DESC) WHERE reply_to IS NULL;
CREATE INDEX IF NOT EXISTS eta_posts_reply_idx ON eta_posts (reply_to, created_at);
CREATE INDEX IF NOT EXISTS eta_posts_user_idx ON eta_posts (author_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eta_posts_npc_idx ON eta_posts (author_npc_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eta_posts_tags_idx ON eta_posts USING GIN (tags);
CREATE INDEX IF NOT EXISTS eta_posts_giveaway_idx ON eta_posts (giveaway_ends_at) WHERE giveaway_prize IS NOT NULL AND giveaway_settled = FALSE;

CREATE TABLE IF NOT EXISTS eta_likes (
    post_id BIGINT NOT NULL REFERENCES eta_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, user_id)
);

-- target_kind 'user' → target_id is a user id; 'npc' → an NPC id from code
CREATE TABLE IF NOT EXISTS eta_follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('user', 'npc')),
    target_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS eta_follows_target_idx ON eta_follows (target_kind, target_id);

CREATE TABLE IF NOT EXISTS eta_reports (
    post_id BIGINT NOT NULL REFERENCES eta_posts(id) ON DELETE CASCADE,
    reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (post_id, reporter_id)
);
