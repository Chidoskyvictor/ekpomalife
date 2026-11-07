-- Rent is collected by the caretaker now (was "Baba Landlord").
ALTER TABLE rent ALTER COLUMN label SET DEFAULT 'Caretaker';
UPDATE rent SET label = 'Caretaker' WHERE label = 'Baba Landlord';
