-- Real-money wallet top-ups via Paystack. Packs live in code (backend/src/game/wallet-packs.ts).
CREATE TABLE IF NOT EXISTS wallet_topups (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id TEXT NOT NULL,
    amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
    game_money BIGINT NOT NULL CHECK (game_money > 0),
    reference TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_topups_user_idx ON wallet_topups (user_id, created_at DESC);
