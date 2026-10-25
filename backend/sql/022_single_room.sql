-- The Poultry road "selfcon" is really a single room (one space: bed, toilet, bucket).
-- Self-con now means a room plus its own bath and kitchen (selfcon-g2).
UPDATE characters SET lodging_id = 'single-poultry' WHERE lodging_id = 'selfcon-oxford';
UPDATE rent SET lodging_id = 'single-poultry' WHERE lodging_id = 'selfcon-oxford';
