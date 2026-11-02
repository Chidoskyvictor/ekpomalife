-- Wise Gourmet menu: order at the window, eat on the spot (the app buys and eats in one go).
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
('wise-shawarma', 'Chicken shawarma', '🌯', 2500, 'food', 'wise-gourmet', '{"needs":{"hunger":40,"fun":8}}'::jsonb, 'eat', NULL),
('wise-chicken-chips', 'Chicken and chips', '🍗', 3500, 'food', 'wise-gourmet', '{"needs":{"hunger":50,"fun":10}}'::jsonb, 'eat', NULL),
('wise-jollof-chicken', 'Jollof and chicken', '🍛', 3000, 'food', 'wise-gourmet', '{"needs":{"hunger":50,"fun":6}}'::jsonb, 'eat', NULL),
('wise-burger', 'Beef burger', '🍔', 3000, 'food', 'wise-gourmet', '{"needs":{"hunger":40,"fun":10}}'::jsonb, 'eat', NULL),
('wise-small-chops', 'Small chops', '🥟', 1500, 'food', 'wise-gourmet', '{"needs":{"hunger":20,"fun":8,"social":4}}'::jsonb, 'eat', NULL),
('wise-chapman', 'Chapman', '🍹', 1200, 'food', 'wise-gourmet', '{"needs":{"hunger":6,"fun":10}}'::jsonb, 'eat', NULL),
('wise-ice-cream', 'Ice cream', '🍦', 1000, 'food', 'wise-gourmet', '{"needs":{"hunger":6,"fun":12}}'::jsonb, 'eat', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  place_id = EXCLUDED.place_id,
  effects = EXCLUDED.effects,
  use_action_id = EXCLUDED.use_action_id;
