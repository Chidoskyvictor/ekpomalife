-- Innovation Hub: feedback (Francis), public suggestions with votes (JOD), the Developers' Corner
-- feed (Chidosky). Admins review submissions and may reward them (amount chosen per submission).
CREATE TABLE IF NOT EXISTS hub_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('review', 'complaint', 'bug', 'experience', 'suggestion')),
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 3 AND 2000),
    stars SMALLINT CHECK (stars BETWEEN 1 AND 5),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'rewarded', 'rejected')),
    hidden BOOLEAN NOT NULL DEFAULT FALSE,
    reward BIGINT NOT NULL DEFAULT 0 CHECK (reward >= 0),
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hub_submissions_user_idx ON hub_submissions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS hub_submissions_status_idx ON hub_submissions (status, created_at DESC);

CREATE TABLE IF NOT EXISTS hub_votes (
    submission_id TEXT NOT NULL REFERENCES hub_submissions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (submission_id, user_id)
);

CREATE TABLE IF NOT EXISTS hub_posts (
    id TEXT PRIMARY KEY,
    author TEXT NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hub_post_reactions (
    post_id TEXT NOT NULL REFERENCES hub_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('👍', '🔥', '😂', '❤️')),
    PRIMARY KEY (post_id, user_id)
);

-- Visits per day (Africa/Lagos), from now on; the all-time total stays in site_counters
CREATE TABLE IF NOT EXISTS site_visits_daily (
    day DATE PRIMARY KEY,
    count BIGINT NOT NULL DEFAULT 0
);
