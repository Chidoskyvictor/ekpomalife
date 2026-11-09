-- The pouffe is a seat: sitting on it uses the same "Sit down" action as a chair.
UPDATE home_furniture SET uses = 'red-chair' WHERE id = 'k-pouffe' AND uses IS NULL;
