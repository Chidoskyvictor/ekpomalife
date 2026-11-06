-- Home design (wall paint, floor, kitchen & bathroom tiles) bought in Buy mode's Design tab.
-- { "wall": "<paint id | #rrggbb>", "floor": "<floor id | #rrggbb>", "tiles": "<floor id | #rrggbb>" }
ALTER TABLE characters ADD COLUMN IF NOT EXISTS home_decor JSONB NOT NULL DEFAULT '{}'::jsonb;
