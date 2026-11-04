-- Spot Rite menu: order at the counter, eat at a table (the app buys and eats in one go, like Wise Gourmet).
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
('sr-rice-chicken', 'Rice and chicken', '🍗', 3000, 'food', 'spot-rite', '{"needs":{"hunger":50,"fun":6}}'::jsonb, 'eat', NULL),
('sr-jollof-chicken', 'Jollof rice and chicken', '🍛', 3500, 'food', 'spot-rite', '{"needs":{"hunger":55,"fun":8}}'::jsonb, 'eat', NULL),
('sr-fried-rice-chicken', 'Fried rice and chicken', '🍚', 3500, 'food', 'spot-rite', '{"needs":{"hunger":55,"fun":8}}'::jsonb, 'eat', NULL),
('sr-jollof', 'Jollof rice', '🍛', 1800, 'food', 'spot-rite', '{"needs":{"hunger":35,"fun":4}}'::jsonb, 'eat', NULL),
('sr-fried-rice', 'Fried rice', '🍚', 1800, 'food', 'spot-rite', '{"needs":{"hunger":35,"fun":4}}'::jsonb, 'eat', NULL),
('sr-dodo', 'Fried plantain (dodo)', '🍌', 800, 'food', 'spot-rite', '{"needs":{"hunger":15,"fun":4}}'::jsonb, 'eat', NULL),
('sr-chilled-drink', 'Chilled soft drink', '🥤', 600, 'food', 'spot-rite', '{"needs":{"hunger":4,"fun":8}}'::jsonb, 'eat', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  place_id = EXCLUDED.place_id,
  effects = EXCLUDED.effects,
  use_action_id = EXCLUDED.use_action_id;
