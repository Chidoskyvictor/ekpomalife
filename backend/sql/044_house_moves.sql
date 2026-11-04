-- Moving house from the phone's Houses app: when you last moved (one move per 7 days).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS moved_at TIMESTAMPTZ;
