-- Anonymous: a Whisper-style anonymous campus feed (phone app).
-- user_id columns exist ONLY for moderation (admins) and per-user rules (likes, blocks, rate limits).
-- No API response for students may ever include them. Everyone is just "Anonymous".
-- NOTE: the API applies backend/sql/*.sql on start (runMigrations), so this runs when the backend
-- carrying this file boots. Do not boot it against the production database without the go-ahead.

CREATE TABLE IF NOT EXISTS anon_communities (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL DEFAULT 'other' CHECK (kind IN ('hostel', 'faculty', 'department', 'other')),
  invite_code   TEXT NOT NULL UNIQUE,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS anon_communities_name_idx ON anon_communities (LOWER(name));

CREATE TABLE IF NOT EXISTS anon_members (
  community_id  TEXT NOT NULL REFERENCES anon_communities(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS anon_members_user_idx ON anon_members (user_id);

CREATE TABLE IF NOT EXISTS anon_posts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  community_id  TEXT REFERENCES anon_communities(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  color         TEXT NOT NULL DEFAULT 'violet',
  category      TEXT NOT NULL DEFAULT 'general',
  like_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  report_count  INTEGER NOT NULL DEFAULT 0,
  -- ok: shown. hidden: auto-hidden after 3 reports, awaiting admin. removed: admin took it down.
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'hidden', 'removed')),
  -- admin dismissed the reports: it will not auto-hide again
  cleared       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS anon_posts_feed_idx ON anon_posts (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS anon_posts_user_idx ON anon_posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS anon_comments (
  id            TEXT PRIMARY KEY,
  post_id       TEXT NOT NULL REFERENCES anon_posts(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body          TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  report_count  INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'hidden', 'removed')),
  cleared       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS anon_comments_post_idx ON anon_comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS anon_comments_user_idx ON anon_comments (user_id, created_at DESC);

-- One like per user per post (tap again deletes the row)
CREATE TABLE IF NOT EXISTS anon_likes (
  post_id       TEXT NOT NULL REFERENCES anon_posts(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS anon_likes_user_idx ON anon_likes (user_id, created_at DESC);

-- One report per user per item
CREATE TABLE IF NOT EXISTS anon_reports (
  id            TEXT PRIMARY KEY,
  target_type   TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
  target_id     TEXT NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL CHECK (reason IN ('harassment', 'threats', 'bullying', 'doxxing', 'spam')),
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS anon_reports_open_idx ON anon_reports (target_type, target_id) WHERE NOT resolved;

-- Private "hide this post for me"
CREATE TABLE IF NOT EXISTS anon_hidden (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id       TEXT NOT NULL REFERENCES anon_posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

-- Blocking an Anonymous author: stored server-side from a post/comment id, the blocker never learns who
CREATE TABLE IF NOT EXISTS anon_blocks (
  blocker_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

-- Moderation standing: warnings and posting bans
CREATE TABLE IF NOT EXISTS anon_user_flags (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  warnings      INTEGER NOT NULL DEFAULT 0,
  banned        BOOLEAN NOT NULL DEFAULT FALSE,
  warned_at     TIMESTAMPTZ,
  banned_at     TIMESTAMPTZ
);
