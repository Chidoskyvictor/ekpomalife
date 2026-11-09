-- Fine furniture is luxury: the textured designer pieces cost what they look like.
-- Only the catalogue price changes; pieces players already own keep what they paid.
UPDATE home_furniture SET price = 1000000 WHERE id = 'k-sofa-designer';
UPDATE home_furniture SET price = 500000 WHERE id = 'k-recliner';
UPDATE home_furniture SET price = 500000 WHERE id = 'k-sofa-chaise';
UPDATE home_furniture SET price = 500000 WHERE id = 'k-flat-tv';
