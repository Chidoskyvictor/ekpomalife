-- One-off production cleanup before migration 036 (unique lower(email)).
-- Removes three test accounts and everything that belongs to them:
--   sectestalpha  2k9IAtJjxHrzyS-xZCyYqA  (email sectestalpha@example.com)
--   newuser777    8fiNfK6W7ydDu9GZTge0Sg  (email sectestalpha@example.com, the collision)
--   kidtest1      fdRIVzkaAb64F_xEON6dvg  (email kid1@example.com)
--
-- Not in backend/sql/, so the server never runs it. Run by hand with psql or the Neon SQL editor:
--   PART 1 is read-only (BEGIN READ ONLY ... ROLLBACK). Review its output.
--   PART 2 deletes in ONE transaction and checks that nothing is left before COMMIT.
--   For a dry run of PART 2, change its final COMMIT to ROLLBACK.
-- Afterwards: npm run db:check-emails should print "No email collisions".
--
-- Rows the schema keeps on purpose (ON DELETE SET NULL) are not deleted, only unlinked:
--   coins.creator_user_id, hostels.created_by, coin_trades.character_id,
--   venue_spray_notes.picked_by, space_host_bans.banned_by.
-- Rows of OTHER players that are removed because they hang off these users' content:
--   replies/likes/reports on their Eta posts, members/comments/bans/reports in Spaces they host,
--   players at Whot tables they host, matches they played, notes on their sprays,
--   reports on their chat messages, and other players' follows of them (eta_follows.target_id).

-- ============================================================================================
-- PART 1: REVIEW (read-only)
-- ============================================================================================
BEGIN READ ONLY;

SELECT id, username, name, email, created_at
FROM users
WHERE id IN ('2k9IAtJjxHrzyS-xZCyYqA', '8fiNfK6W7ydDu9GZTge0Sg', 'fdRIVzkaAb64F_xEON6dvg')
ORDER BY created_at;

-- Row counts per table: what PART 2 would delete (or unlink, where action = 'set null')
WITH u(id) AS (VALUES ('2k9IAtJjxHrzyS-xZCyYqA'), ('8fiNfK6W7ydDu9GZTge0Sg'), ('fdRIVzkaAb64F_xEON6dvg')),
c AS (SELECT id FROM characters WHERE user_id IN (SELECT id FROM u)),
posts AS (
  WITH RECURSIVE p(id) AS (
    SELECT id FROM eta_posts WHERE author_user_id IN (SELECT id FROM u)
    UNION SELECT e.id FROM eta_posts e JOIN p ON e.reply_to = p.id
  ) SELECT id FROM p
),
msgs AS (SELECT seq FROM chat_messages WHERE sender_id IN (SELECT id FROM u)),
sp AS (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM u)),
wt AS (SELECT id FROM whot_tables WHERE host_id IN (SELECT id FROM c)),
spr AS (SELECT id FROM venue_sprays WHERE sprayer_id IN (SELECT id FROM c))
SELECT * FROM (VALUES
  ('users',              'delete',   (SELECT COUNT(*) FROM users WHERE id IN (SELECT id FROM u))),
  ('characters',         'delete',   (SELECT COUNT(*) FROM c)),
  ('sessions',           'delete',   (SELECT COUNT(*) FROM sessions WHERE user_id IN (SELECT id FROM u))),
  ('password_resets',    'delete',   (SELECT COUNT(*) FROM password_resets WHERE user_id IN (SELECT id FROM u))),
  ('player_profiles',    'delete',   (SELECT COUNT(*) FROM player_profiles WHERE user_id IN (SELECT id FROM u))),
  ('house_plots',        'delete',   (SELECT COUNT(*) FROM house_plots WHERE user_id IN (SELECT id FROM u))),
  ('wallet_topups',      'delete',   (SELECT COUNT(*) FROM wallet_topups WHERE user_id IN (SELECT id FROM u))),
  ('idempotency_keys',   'delete',   (SELECT COUNT(*) FROM idempotency_keys WHERE user_id IN (SELECT id FROM u) OR character_id IN (SELECT id FROM c))),
  ('chat_members',       'delete',   (SELECT COUNT(*) FROM chat_members WHERE user_id IN (SELECT id FROM u))),
  ('chat_messages',      'delete',   (SELECT COUNT(*) FROM msgs)),
  ('chat_reports',       'delete',   (SELECT COUNT(*) FROM chat_reports WHERE reporter_id IN (SELECT id FROM u) OR message_seq IN (SELECT seq FROM msgs))),
  ('hostel_members',     'delete',   (SELECT COUNT(*) FROM hostel_members WHERE user_id IN (SELECT id FROM u))),
  ('hostels',            'set null', (SELECT COUNT(*) FROM hostels WHERE created_by IN (SELECT id FROM u))),
  ('eta_posts',          'delete',   (SELECT COUNT(*) FROM posts)),
  ('eta_likes',          'delete',   (SELECT COUNT(*) FROM eta_likes WHERE user_id IN (SELECT id FROM u) OR post_id IN (SELECT id FROM posts))),
  ('eta_reports',        'delete',   (SELECT COUNT(*) FROM eta_reports WHERE reporter_id IN (SELECT id FROM u) OR post_id IN (SELECT id FROM posts))),
  ('eta_follows',        'delete',   (SELECT COUNT(*) FROM eta_follows WHERE follower_id IN (SELECT id FROM u) OR (target_kind = 'user' AND target_id IN (SELECT id FROM u)))),
  ('coin_follows',       'delete',   (SELECT COUNT(*) FROM coin_follows WHERE user_id IN (SELECT id FROM u))),
  ('coins',              'set null', (SELECT COUNT(*) FROM coins WHERE creator_user_id IN (SELECT id FROM u))),
  ('spaces',             'delete',   (SELECT COUNT(*) FROM sp)),
  ('space_members',      'delete',   (SELECT COUNT(*) FROM space_members WHERE user_id IN (SELECT id FROM u) OR space_id IN (SELECT id FROM sp))),
  ('space_comments',     'delete',   (SELECT COUNT(*) FROM space_comments WHERE user_id IN (SELECT id FROM u) OR space_id IN (SELECT id FROM sp))),
  ('space_bans',         'delete',   (SELECT COUNT(*) FROM space_bans WHERE user_id IN (SELECT id FROM u) OR space_id IN (SELECT id FROM sp))),
  ('space_reports',      'delete',   (SELECT COUNT(*) FROM space_reports WHERE reporter_id IN (SELECT id FROM u) OR space_id IN (SELECT id FROM sp))),
  ('space_host_bans',    'delete',   (SELECT COUNT(*) FROM space_host_bans WHERE user_id IN (SELECT id FROM u))),
  ('space_host_bans',    'set null', (SELECT COUNT(*) FROM space_host_bans WHERE banned_by IN (SELECT id FROM u) AND user_id NOT IN (SELECT id FROM u))),
  ('game_state',         'delete',   (SELECT COUNT(*) FROM game_state WHERE character_id IN (SELECT id FROM c))),
  ('ledger',             'delete',   (SELECT COUNT(*) FROM ledger WHERE character_id IN (SELECT id FROM c))),
  ('inventory',          'delete',   (SELECT COUNT(*) FROM inventory WHERE character_id IN (SELECT id FROM c))),
  ('player_jobs',        'delete',   (SELECT COUNT(*) FROM player_jobs WHERE character_id IN (SELECT id FROM c))),
  ('rent',               'delete',   (SELECT COUNT(*) FROM rent WHERE character_id IN (SELECT id FROM c))),
  ('payouts',            'delete',   (SELECT COUNT(*) FROM payouts WHERE character_id IN (SELECT id FROM c))),
  ('phone_state',        'delete',   (SELECT COUNT(*) FROM phone_state WHERE character_id IN (SELECT id FROM c))),
  ('room_items',         'delete',   (SELECT COUNT(*) FROM room_items WHERE character_id IN (SELECT id FROM c))),
  ('room_style',         'delete',   (SELECT COUNT(*) FROM room_style WHERE character_id IN (SELECT id FROM c))),
  ('home_placements',    'delete',   (SELECT COUNT(*) FROM home_placements WHERE character_id IN (SELECT id FROM c))),
  ('business_holdings',  'delete',   (SELECT COUNT(*) FROM business_holdings WHERE character_id IN (SELECT id FROM c))),
  ('land_holdings',      'delete',   (SELECT COUNT(*) FROM land_holdings WHERE character_id IN (SELECT id FROM c))),
  ('ride_holdings',      'delete',   (SELECT COUNT(*) FROM ride_holdings WHERE character_id IN (SELECT id FROM c))),
  ('coin_holdings',      'delete',   (SELECT COUNT(*) FROM coin_holdings WHERE character_id IN (SELECT id FROM c))),
  ('coin_trades',        'set null', (SELECT COUNT(*) FROM coin_trades WHERE character_id IN (SELECT id FROM c))),
  ('invest_events',      'delete',   (SELECT COUNT(*) FROM invest_events WHERE character_id IN (SELECT id FROM c))),
  ('game_rewards',       'delete',   (SELECT COUNT(*) FROM game_rewards WHERE character_id IN (SELECT id FROM c))),
  ('game_matches',       'delete',   (SELECT COUNT(*) FROM game_matches WHERE host_id IN (SELECT id FROM c) OR guest_id IN (SELECT id FROM c))),
  ('game_matches',       'set null', (SELECT COUNT(*) FROM game_matches WHERE winner_id IN (SELECT id FROM c) AND host_id NOT IN (SELECT id FROM c) AND guest_id NOT IN (SELECT id FROM c))),
  ('venue_visits',       'delete',   (SELECT COUNT(*) FROM venue_visits WHERE character_id IN (SELECT id FROM c))),
  ('venue_sprays',       'delete',   (SELECT COUNT(*) FROM spr)),
  ('venue_spray_notes',  'delete',   (SELECT COUNT(*) FROM venue_spray_notes WHERE spray_id IN (SELECT id FROM spr))),
  ('venue_spray_notes',  'set null', (SELECT COUNT(*) FROM venue_spray_notes WHERE picked_by IN (SELECT id FROM c) AND spray_id NOT IN (SELECT id FROM spr))),
  ('whot_tables',        'delete',   (SELECT COUNT(*) FROM wt)),
  ('whot_tables',        'set null', (SELECT COUNT(*) FROM whot_tables WHERE winner_id IN (SELECT id FROM c) AND id NOT IN (SELECT id FROM wt))),
  ('whot_table_players', 'delete',   (SELECT COUNT(*) FROM whot_table_players WHERE character_id IN (SELECT id FROM c) OR table_id IN (SELECT id FROM wt)))
) AS t(table_name, action, row_count)
ORDER BY row_count DESC, table_name;

-- Full rows for the tables these accounts actually touch (from the scan of every text/JSON column)
SELECT * FROM characters WHERE user_id IN ('2k9IAtJjxHrzyS-xZCyYqA', '8fiNfK6W7ydDu9GZTge0Sg', 'fdRIVzkaAb64F_xEON6dvg');
SELECT id, user_id, created_at, expires_at FROM sessions WHERE user_id IN ('2k9IAtJjxHrzyS-xZCyYqA', '8fiNfK6W7ydDu9GZTge0Sg', 'fdRIVzkaAb64F_xEON6dvg');
SELECT id, user_id, created_at, expires_at, used_at FROM password_resets WHERE user_id IN ('2k9IAtJjxHrzyS-xZCyYqA', '8fiNfK6W7ydDu9GZTge0Sg', 'fdRIVzkaAb64F_xEON6dvg');

ROLLBACK;

-- ============================================================================================
-- PART 2: DELETE (one transaction)
-- ============================================================================================
BEGIN;

CREATE TEMP TABLE cleanup_users ON COMMIT DROP AS
SELECT id FROM users
WHERE (id, username) IN (
  ('2k9IAtJjxHrzyS-xZCyYqA', 'sectestalpha'),
  ('8fiNfK6W7ydDu9GZTge0Sg', 'newuser777'),
  ('fdRIVzkaAb64F_xEON6dvg', 'kidtest1')
);

-- Stop unless all three id + username pairs still match exactly.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM cleanup_users) <> 3 THEN
    RAISE EXCEPTION 'Expected 3 test users, found %. Nothing deleted.', (SELECT COUNT(*) FROM cleanup_users);
  END IF;
END $$;

CREATE TEMP TABLE cleanup_chars ON COMMIT DROP AS
SELECT id FROM characters WHERE user_id IN (SELECT id FROM cleanup_users);

CREATE TEMP TABLE cleanup_posts ON COMMIT DROP AS
WITH RECURSIVE p(id) AS (
  SELECT id FROM eta_posts WHERE author_user_id IN (SELECT id FROM cleanup_users)
  UNION SELECT e.id FROM eta_posts e JOIN p ON e.reply_to = p.id
) SELECT id FROM p;

-- References with no ON DELETE action (or no foreign key) on other players' rows
UPDATE whot_tables SET winner_id = NULL WHERE winner_id IN (SELECT id FROM cleanup_chars);
UPDATE game_matches SET winner_id = NULL WHERE winner_id IN (SELECT id FROM cleanup_chars);

-- Content hanging off these users' rows
DELETE FROM chat_reports WHERE reporter_id IN (SELECT id FROM cleanup_users)
  OR message_seq IN (SELECT seq FROM chat_messages WHERE sender_id IN (SELECT id FROM cleanup_users));
DELETE FROM chat_messages WHERE sender_id IN (SELECT id FROM cleanup_users);
DELETE FROM chat_members WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM eta_likes WHERE user_id IN (SELECT id FROM cleanup_users) OR post_id IN (SELECT id FROM cleanup_posts);
DELETE FROM eta_reports WHERE reporter_id IN (SELECT id FROM cleanup_users) OR post_id IN (SELECT id FROM cleanup_posts);
DELETE FROM eta_posts WHERE id IN (SELECT id FROM cleanup_posts);
DELETE FROM eta_follows WHERE follower_id IN (SELECT id FROM cleanup_users)
  OR (target_kind = 'user' AND target_id IN (SELECT id FROM cleanup_users));
DELETE FROM coin_follows WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM space_members WHERE user_id IN (SELECT id FROM cleanup_users)
  OR space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM cleanup_users));
DELETE FROM space_comments WHERE user_id IN (SELECT id FROM cleanup_users)
  OR space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM cleanup_users));
DELETE FROM space_bans WHERE user_id IN (SELECT id FROM cleanup_users)
  OR space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM cleanup_users));
DELETE FROM space_reports WHERE reporter_id IN (SELECT id FROM cleanup_users)
  OR space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM cleanup_users));
DELETE FROM space_host_bans WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM spaces WHERE host_id IN (SELECT id FROM cleanup_users);
DELETE FROM hostel_members WHERE user_id IN (SELECT id FROM cleanup_users);

-- Game data on their characters
DELETE FROM whot_table_players WHERE character_id IN (SELECT id FROM cleanup_chars)
  OR table_id IN (SELECT id FROM whot_tables WHERE host_id IN (SELECT id FROM cleanup_chars));
DELETE FROM whot_tables WHERE host_id IN (SELECT id FROM cleanup_chars);
DELETE FROM game_matches WHERE host_id IN (SELECT id FROM cleanup_chars) OR guest_id IN (SELECT id FROM cleanup_chars);
DELETE FROM game_rewards WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM venue_spray_notes WHERE spray_id IN (SELECT id FROM venue_sprays WHERE sprayer_id IN (SELECT id FROM cleanup_chars));
DELETE FROM venue_sprays WHERE sprayer_id IN (SELECT id FROM cleanup_chars);
DELETE FROM venue_visits WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM game_state WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM ledger WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM inventory WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM player_jobs WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM rent WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM payouts WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM phone_state WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM room_items WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM room_style WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM home_placements WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM business_holdings WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM land_holdings WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM ride_holdings WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM coin_holdings WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM invest_events WHERE character_id IN (SELECT id FROM cleanup_chars);
DELETE FROM idempotency_keys WHERE user_id IN (SELECT id FROM cleanup_users) OR character_id IN (SELECT id FROM cleanup_chars);

-- Account rows
DELETE FROM sessions WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM password_resets WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM player_profiles WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM house_plots WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM wallet_topups WHERE user_id IN (SELECT id FROM cleanup_users);
DELETE FROM characters WHERE id IN (SELECT id FROM cleanup_chars);
-- coins.creator_user_id, hostels.created_by, coin_trades.character_id, venue_spray_notes.picked_by
-- and space_host_bans.banned_by are set to NULL by their foreign keys here.
DELETE FROM users WHERE id IN (SELECT id FROM cleanup_users);

-- Stop (and undo everything) if anything still points at them, or the email collision remains.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id IN (SELECT id FROM cleanup_users))
     OR EXISTS (SELECT 1 FROM characters WHERE id IN (SELECT id FROM cleanup_chars))
     OR EXISTS (SELECT 1 FROM sessions WHERE user_id IN (SELECT id FROM cleanup_users))
     OR EXISTS (SELECT 1 FROM eta_follows WHERE target_kind = 'user' AND target_id IN (SELECT id FROM cleanup_users))
     OR EXISTS (SELECT 1 FROM game_matches WHERE winner_id IN (SELECT id FROM cleanup_chars)) THEN
    RAISE EXCEPTION 'Cleanup left rows behind. Rolled back.';
  END IF;
  IF EXISTS (SELECT 1 FROM users WHERE email IS NOT NULL GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Email collisions still exist after cleanup. Rolled back.';
  END IF;
END $$;

COMMIT;
