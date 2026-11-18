-- Gigs part 2: houses get a few clutter props over time; a hired Cleaner taps them away in 3D.
CREATE TABLE IF NOT EXISTS house_mess (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  x          INTEGER NOT NULL,
  z          INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleared_at TIMESTAMPTZ,
  cleared_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  gig_id     TEXT REFERENCES gigs(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS house_mess_open_idx ON house_mess (owner_id) WHERE cleared_at IS NULL;
CREATE INDEX IF NOT EXISTS house_mess_gig_idx ON house_mess (gig_id) WHERE gig_id IS NOT NULL;

-- When a house last got new mess (spawned lazily the next time anyone looks)
CREATE TABLE IF NOT EXISTS house_mess_state (
  owner_id      TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_spawn_at TIMESTAMPTZ NOT NULL
);
