-- Mama Amina Bukka menu (cheaper than Spot Rite): order at the counter, eat at a table.
-- Keeps the old plate of jollof, moi moi and zobo (007), adds the rest.
INSERT INTO shop_items (id, name, emoji, price, category, place_id, effects, use_action_id, stock) VALUES
('bk-rice-stew', 'Rice and stew', '🍛', 700, 'food', 'bukka', '{"needs":{"hunger":35,"fun":3}}'::jsonb, 'eat', NULL),
('bk-rice-chicken', 'Rice and chicken', '🍗', 1500, 'food', 'bukka', '{"needs":{"hunger":50,"fun":5}}'::jsonb, 'eat', NULL),
('bk-fried-rice', 'Fried rice', '🍚', 900, 'food', 'bukka', '{"needs":{"hunger":35,"fun":4}}'::jsonb, 'eat', NULL),
('bk-beans-dodo', 'Beans and dodo', '🫘', 600, 'food', 'bukka', '{"needs":{"hunger":35,"fun":3}}'::jsonb, 'eat', NULL),
('bk-eba-egusi', 'Eba and egusi soup', '🥣', 800, 'food', 'bukka', '{"needs":{"hunger":45,"fun":4}}'::jsonb, 'eat', NULL),
('bk-amala-ewedu', 'Amala and ewedu', '🥣', 800, 'food', 'bukka', '{"needs":{"hunger":45,"fun":4}}'::jsonb, 'eat', NULL),
('bk-pure-water', 'Pure water', '💧', 50, 'food', 'bukka', '{"needs":{"hunger":2}}'::jsonb, 'eat', NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  place_id = EXCLUDED.place_id,
  effects = EXCLUDED.effects,
  use_action_id = EXCLUDED.use_action_id;
