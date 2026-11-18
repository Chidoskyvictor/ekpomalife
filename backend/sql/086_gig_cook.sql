-- Gigs: Cook jobs. The owner picks a dish; the cook makes it at the owner's stove in 3D and it lands in the owner's bag.
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS dish TEXT;
ALTER TABLE gigs ADD COLUMN IF NOT EXISTS cooked_at TIMESTAMPTZ;

-- Home-cooked dishes (never sold in a shop: the place does not exist). price = the ingredients the cook buys.
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
  ('dish-jollof-rice', 'Jollof rice', '🍲', 1500, 'food', 'cook-gig', '{"needs":{"hunger":40,"fun":5}}'::jsonb, 'eat', NULL),
  ('dish-fried-rice', 'Fried rice and chicken', '🍛', 1800, 'food', 'cook-gig', '{"needs":{"hunger":42,"fun":6}}'::jsonb, 'eat', NULL),
  ('dish-egusi', 'Egusi and pounded yam', '🥘', 2500, 'food', 'cook-gig', '{"needs":{"hunger":55,"fun":8}}'::jsonb, 'eat', NULL),
  ('dish-moi-moi', 'Moi moi', '🫘', 1200, 'food', 'cook-gig', '{"needs":{"hunger":25,"fun":5}}'::jsonb, 'eat', NULL),
  ('dish-pepper-soup', 'Pepper soup', '🍜', 2000, 'food', 'cook-gig', '{"needs":{"hunger":35,"fun":10}}'::jsonb, 'eat', NULL),
  ('dish-efo-riro', 'Efo riro and rice', '🥬', 2200, 'food', 'cook-gig', '{"needs":{"hunger":45,"fun":6}}'::jsonb, 'eat', NULL),
  ('dish-ofada', 'Ofada rice and stew', '🍚', 2800, 'food', 'cook-gig', '{"needs":{"hunger":50,"fun":6}}'::jsonb, 'eat', NULL),
  ('dish-suya', 'Suya platter', '🍢', 3000, 'food', 'cook-gig', '{"needs":{"hunger":30,"fun":15}}'::jsonb, 'eat', NULL)
ON CONFLICT (id) DO NOTHING;
