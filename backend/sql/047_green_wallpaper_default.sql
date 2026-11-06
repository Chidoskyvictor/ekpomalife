-- Phone wallpaper: green & white is the new default. Phones still on the old default move over.
ALTER TABLE phone_state ALTER COLUMN wallpaper SET DEFAULT 'green-white';
UPDATE phone_state SET wallpaper = 'green-white' WHERE wallpaper = 'aau-dusk';
