-- Billboard ad tracking: every pop-up open and button tap (WhatsApp, Call, Join group, Share).
-- user_id is null for guests. Shown to admins on /admin/billboards.
CREATE TABLE IF NOT EXISTS ad_clicks (
    id BIGSERIAL PRIMARY KEY,
    board INT NOT NULL,
    ad_id TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ad_clicks_ad_time ON ad_clicks (ad_id, created_at DESC);
