-- Support account: messaging only (no character, house or game), verified tick and a real picture.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_support BOOLEAN NOT NULL DEFAULT false;
