-- Each player's lot on their street: a house number, handed out in order and never reused.
-- The street scene shows the block of lots holding your number; yours gets the "Your house" tag.
CREATE SEQUENCE IF NOT EXISTS house_number_seq START 1;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS house_number INTEGER;

-- Existing players, oldest first, after any numbers already handed out
UPDATE characters c
SET house_number = n.num
FROM (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY updated_at, id)
             + COALESCE((SELECT MAX(house_number) FROM characters), 0) AS num
    FROM characters
    WHERE house_number IS NULL
) n
WHERE c.id = n.id;

-- New characters take the next free number
SELECT setval('house_number_seq', COALESCE((SELECT MAX(house_number) FROM characters), 0) + 1, false);
ALTER SEQUENCE house_number_seq OWNED BY characters.house_number;
ALTER TABLE characters ALTER COLUMN house_number SET DEFAULT nextval('house_number_seq');

CREATE UNIQUE INDEX IF NOT EXISTS characters_house_number_idx ON characters (house_number);
