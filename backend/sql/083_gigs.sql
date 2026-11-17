-- Gigs: a player-to-player job market. Fee (+ item budget) is held in escrow when the owner hires,
-- released to the worker when the owner accepts (or 24h after the worker marks it done).
CREATE TABLE IF NOT EXISTS gigs (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  worker_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  direct_to     TEXT REFERENCES users(id) ON DELETE SET NULL,
  category      TEXT NOT NULL CHECK (category IN ('decorator', 'cleaner', 'driver', 'dj', 'cook', 'other')),
  title         TEXT NOT NULL,
  details       TEXT NOT NULL DEFAULT '',
  fee           BIGINT NOT NULL CHECK (fee > 0),
  budget        BIGINT NOT NULL DEFAULT 0 CHECK (budget >= 0),
  budget_spent  BIGINT NOT NULL DEFAULT 0 CHECK (budget_spent >= 0),
  -- naira held for this job right now (fee + unspent budget), 0 once paid out or refunded
  escrow        BIGINT NOT NULL DEFAULT 0 CHECK (escrow >= 0),
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'hired', 'working', 'done', 'completed', 'cancelled', 'disputed')),
  start_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  hired_at      TIMESTAMPTZ,
  started_at    TIMESTAMPTZ,
  done_at       TIMESTAMPTZ,
  auto_accept_at TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  snapshot      JSONB,
  dispute_reason TEXT,
  rating_worker SMALLINT CHECK (rating_worker BETWEEN 1 AND 5),
  rating_owner  SMALLINT CHECK (rating_owner BETWEEN 1 AND 5),
  report_count  INTEGER NOT NULL DEFAULT 0,
  hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gigs_board_idx ON gigs (status, hidden, created_at DESC);
CREATE INDEX IF NOT EXISTS gigs_owner_idx ON gigs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gigs_worker_idx ON gigs (worker_id, status);

CREATE TABLE IF NOT EXISTS gig_applications (
  gig_id     TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (gig_id, user_id)
);

-- Players listed for hire ("Find a pro")
CREATE TABLE IF NOT EXISTS gig_pros (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  categories TEXT[] NOT NULL DEFAULT '{}',
  from_price BIGINT NOT NULL DEFAULT 0 CHECK (from_price >= 0),
  pitch      TEXT NOT NULL DEFAULT '',
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A report on a post or a pro profile (one per reporter per target); an admin reads them
CREATE TABLE IF NOT EXISTS gig_reports (
  id          TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gig_id      TEXT REFERENCES gigs(id) ON DELETE CASCADE,
  pro_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  reason      TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((gig_id IS NULL) <> (pro_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gig_reports_gig_uq ON gig_reports (reporter_id, gig_id) WHERE gig_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gig_reports_pro_uq ON gig_reports (reporter_id, pro_id) WHERE pro_id IS NOT NULL;

-- Every money move on a gig, for audit and tests
CREATE TABLE IF NOT EXISTS gig_events (
  id         TEXT PRIMARY KEY,
  gig_id     TEXT NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  amount     BIGINT NOT NULL DEFAULT 0,
  user_id    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gig_events_gig_idx ON gig_events (gig_id, created_at);

UPDATE phone_state SET new_apps = array_append(new_apps, 'gigs') WHERE NOT ('gigs' = ANY (new_apps));
ALTER TABLE phone_state ALTER COLUMN new_apps SET DEFAULT ARRAY['ride', 'calendar', 'games', 'gigs'];
