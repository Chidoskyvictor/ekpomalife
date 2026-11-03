-- migrate:no-transaction
-- CREATE INDEX CONCURRENTLY cannot run in a transaction, so the runner sends each
-- "-- statement" chunk on its own. Check first with: npm run db:check-emails

-- 1. Stop if two accounts share an email once trimmed + lowercased. Nothing is deleted or merged.
DO $$
DECLARE clashes INT;
BEGIN
  SELECT COUNT(*) INTO clashes FROM (
    SELECT LOWER(TRIM(email)) FROM users WHERE email IS NOT NULL
    GROUP BY LOWER(TRIM(email)) HAVING COUNT(*) > 1
  ) dupes;
  IF clashes > 0 THEN
    RAISE EXCEPTION '036: % email(s) are shared by more than one account. Run npm run db:check-emails and resolve them by hand.', clashes;
  END IF;
END $$;

-- statement
-- 2. A failed earlier run can leave an INVALID index that IF NOT EXISTS would silently keep.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'users_email_lower_unique' AND NOT i.indisvalid
  ) THEN
    RAISE EXCEPTION '036: users_email_lower_unique is INVALID from an earlier failed run. Run DROP INDEX CONCURRENTLY users_email_lower_unique; then restart.';
  END IF;
END $$;

-- statement
UPDATE users SET email = LOWER(TRIM(email)) WHERE email IS NOT NULL AND email <> LOWER(TRIM(email));

-- statement
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS users_email_lower_unique ON users (LOWER(email));
