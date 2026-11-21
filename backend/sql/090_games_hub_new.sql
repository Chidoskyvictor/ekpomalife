-- Games got a new hub (tables, watch, top charts): show the NEW pill on the Games icon again
-- for every player until they open it.
UPDATE phone_state
SET new_apps = array_append(new_apps, 'games')
WHERE NOT ('games' = ANY (new_apps));
