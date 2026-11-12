-- Driving: where each car was left (a place on the map, with the exact spot for drawing it).
-- NULL parked_place = at the owner's home carport.
ALTER TABLE car_holdings ADD COLUMN IF NOT EXISTS parked_place TEXT;
ALTER TABLE car_holdings ADD COLUMN IF NOT EXISTS parked_x REAL;
ALTER TABLE car_holdings ADD COLUMN IF NOT EXISTS parked_z REAL;
