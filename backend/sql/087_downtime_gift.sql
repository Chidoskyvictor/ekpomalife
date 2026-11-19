-- Sorry for the downtime (Render bandwidth limit, Nov 2026): every player already registered gets
-- ₦2,000,000 straight into their bank, once, from Ekpoma Life. Players who sign up later don't.
-- player_gifts guards against paying twice and drives the one-time "sorry" popup (seen_at).

CREATE TABLE IF NOT EXISTS player_gifts (
    gift_id TEXT NOT NULL,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    signed TEXT,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    seen_at TIMESTAMPTZ,
    PRIMARY KEY (gift_id, character_id)
);

CREATE INDEX IF NOT EXISTS player_gifts_unseen_idx ON player_gifts (character_id) WHERE seen_at IS NULL;

WITH paid AS (
    INSERT INTO player_gifts (gift_id, character_id, amount, title, message, signed)
    SELECT 'downtime-2026-11', gs.character_id, 2000000,
           'Sorry for the downtime',
           'We were down for a while, and we''re sorry. ₦2,000,000 has been sent to your bank. Thank you for playing Ekpoma Life.',
           'prodigy_francis'
    FROM game_state gs
    ON CONFLICT (gift_id, character_id) DO NOTHING
    RETURNING character_id, amount
),
credited AS (
    UPDATE game_state g
    SET cash = g.cash + paid.amount, version = g.version + 1, updated_at = NOW()
    FROM paid
    WHERE g.character_id = paid.character_id
    RETURNING g.character_id, g.cash, paid.amount
)
INSERT INTO ledger (id, character_id, amount, reason, kind, balance_after)
SELECT 'gift_downtime-2026-11_' || character_id, character_id, amount, 'Ekpoma Life · Sorry for the downtime 💙', 'gift', cash
FROM credited
ON CONFLICT (id) DO NOTHING;
