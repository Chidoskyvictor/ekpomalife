-- Each player's house on the map: one plot in the estates (the hostel-house grids). Plot numbers
-- match lib/game/estates.ts on the app; the estate grows if it ever fills (more rows).
CREATE TABLE IF NOT EXISTS house_plots (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plot INTEGER NOT NULL UNIQUE CHECK (plot >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
