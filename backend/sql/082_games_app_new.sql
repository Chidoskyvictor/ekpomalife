-- Phone → Games got Tic tac toe, Chess and Ludo (online with stakes) plus chat and voice:
-- show the NEW pill on the Games icon for every player until they open it.
UPDATE phone_state
SET new_apps = array_append(new_apps, 'games')
WHERE NOT ('games' = ANY (new_apps));

ALTER TABLE phone_state ALTER COLUMN new_apps SET DEFAULT ARRAY['ride', 'calendar', 'games'];
