-- Ekpoma Market is removed from the game (map building, place and shop).

-- Its six shop items are retired, not deleted: inventory rows reference shop_items, so players who
-- already own one (e.g. a lodge deed paying landlord income) keep it. No place lists 'retired',
-- so nothing sells them any more.
UPDATE shop_items SET place_id = 'retired' WHERE place_id = 'market';

-- Anyone standing at the market moves to the default start spot.
UPDATE game_state SET location_id = 'admin-block' WHERE location_id = 'market';
