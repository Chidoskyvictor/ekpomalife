-- Buy mode "Styles": a ready-made room look bought in one tap. A style is a list of items (each in a
-- finish colour, see 055) plus optionally a wall paint and a floor from the Design tab. The server
-- lays the items out on the player's own floor plan (see planStyle in home-buy-rules.ts), reuses
-- pieces they already own and buys only what is missing.
--
-- items: [{"item": "<home_furniture id>", "finish": "#rrggbb" | null}, ...] in the order they are placed.
-- To add more items later (e.g. the naija/ models), append entries here; an item id that is not in
-- home_furniture is simply skipped, so a style can list items before their rows exist.
-- Additive and idempotent.
CREATE TABLE IF NOT EXISTS home_styles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    blurb TEXT NOT NULL DEFAULT '',
    wall TEXT,
    floor TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO home_styles (id, name, emoji, blurb, wall, floor, items, sort) VALUES
('fresher-budget', 'Fresher on a budget', '🎒', 'Bed, chair, lamp. Na so we start.', 'classic-cream', NULL,
 '[{"item":"k-single-bed","finish":"#d9b98c"},{"item":"k-wooden-chair","finish":"#a9744f"},{"item":"k-student-desk","finish":"#d9b98c"},{"item":"k-table-lamp","finish":"#fde08a"},{"item":"k-small-plant","finish":null}]', 0),
('exam-week', 'Exam Week', '📚', 'Desk, lamp, books. Pray say light no go.', 'aau-sky', NULL,
 '[{"item":"k-student-desk","finish":"#d9b98c"},{"item":"k-office-chair","finish":"#9ca3af"},{"item":"k-bookcase-narrow","finish":"#d9b98c"},{"item":"k-bookcase-wide","finish":"#d9b98c"},{"item":"k-floor-lamp-square","finish":"#fde08a"},{"item":"k-table-lamp","finish":"#fde08a"}]', 1),
('aau-hostel-classic', 'AAU Hostel Classic', '🏫', 'Bunk, desk, small fridge. Igbinedion vibes.', 'mint-fresh', NULL,
 '[{"item":"k-bunk-bed","finish":"#a9744f"},{"item":"k-student-desk","finish":"#a9744f"},{"item":"k-office-chair","finish":"#9ca3af"},{"item":"k-tabletop-fridge","finish":"#cfd4da"},{"item":"k-floor-lamp-square","finish":"#fde08a"},{"item":"k-wooden-chair","finish":"#a9744f"},{"item":"k-waste-bin","finish":"#3a3a3c"}]', 2),
('plant-lover', 'Plant Lover', '🪴', 'Even your room dey photosynthesise.', 'mint-fresh', NULL,
 '[{"item":"k-single-bed","finish":"#d9b98c"},{"item":"k-house-plant","finish":null},{"item":"k-house-plant","finish":null},{"item":"k-small-plant","finish":null},{"item":"k-small-plant-2","finish":null},{"item":"k-armchair","finish":"#2f7d4f"},{"item":"k-side-table","finish":"#d9b98c"},{"item":"k-table-lamp","finish":"#fde08a"}]', 3),
('pastor-quiet-corner', 'Pastor''s Quiet Corner', '⛪', 'Peace, bookshelves and one holy armchair.', 'classic-cream', 'terrazzo',
 '[{"item":"k-single-bed","finish":"#d9b98c"},{"item":"k-bookcase-wide","finish":"#d9b98c"},{"item":"k-bookcase-doors","finish":"#d9b98c"},{"item":"k-armchair","finish":"#9d2a4a"},{"item":"k-side-table","finish":"#d9b98c"},{"item":"k-floor-lamp-round","finish":"#fde08a"},{"item":"k-radio-set","finish":"#cfd4da"},{"item":"k-house-plant","finish":null}]', 4),
('babe-pink-haven', 'Babe''s Pink Haven', '💖', 'Pink everywhere. Boys, knock before you enter.', 'peach-glow', 'white-marble',
 '[{"item":"k-spring-bed","finish":"#d9b98c"},{"item":"k-sofa-two","finish":"#9d2a4a"},{"item":"k-teddy-bear","finish":"#9d2a4a"},{"item":"k-floor-lamp-round","finish":"#e26a6a"},{"item":"k-table-lamp","finish":"#e26a6a"},{"item":"k-side-table","finish":"#d9b98c"},{"item":"k-hand-basin","finish":"#f0b8c8"},{"item":"k-wc-square","finish":"#f0b8c8"},{"item":"k-house-plant","finish":null}]', 5),
('gamer-den', 'Gamer Den', '🎮', 'Big screen, loud speakers, zero girlfriend.', 'ekpoma-charcoal', 'black-marble',
 '[{"item":"k-single-bed","finish":"#4b3a33"},{"item":"k-flat-tv","finish":"#3a3a3c"},{"item":"k-tv-stand","finish":"#4b3a33"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-recliner","finish":"#9ca3af"},{"item":"k-student-desk","finish":"#4b3a33"},{"item":"k-tabletop-fridge","finish":"#3a3a3c"}]', 6),
('selfcon-comfort', 'Self-Con Comfort', '🛋️', 'Small space, big sense. Everything dey its place.', 'classic-cream', 'wood-parquet',
 '[{"item":"k-spring-bed","finish":"#d9b98c"},{"item":"k-sofa-two","finish":"#9ca3af"},{"item":"k-flat-tv","finish":"#cfd4da"},{"item":"k-tv-stand","finish":"#d9b98c"},{"item":"k-tabletop-fridge","finish":"#cfd4da"},{"item":"k-student-desk","finish":"#d9b98c"},{"item":"k-office-chair","finish":"#9ca3af"},{"item":"k-floor-lamp-square","finish":"#fde08a"}]', 7),
('couples-nest', 'Couple''s Nest', '💑', 'Double bed, cosy sofa, one fridge for two.', 'peach-glow', 'wood-parquet',
 '[{"item":"k-spring-bed","finish":"#8a3b2a"},{"item":"k-side-table","finish":"#8a3b2a"},{"item":"k-side-table","finish":"#8a3b2a"},{"item":"k-table-lamp","finish":"#fde08a"},{"item":"k-table-lamp","finish":"#fde08a"},{"item":"k-sofa-two","finish":"#9d2a4a"},{"item":"k-centre-table","finish":"#a9744f"},{"item":"k-flat-tv","finish":"#3a3a3c"},{"item":"k-fridge","finish":"#cfd4da"},{"item":"k-gas-cooker-oven","finish":"#cfd4da"}]', 8),
('owambe-ready', 'Owambe Ready', '🥁', 'Sofa, speakers and enough chairs for the whole street.', 'owambe-gold', 'checkerboard',
 '[{"item":"k-sofa-chaise","finish":"#d6a21e"},{"item":"k-sofa-two","finish":"#9d2a4a"},{"item":"k-cushion-chair","finish":"#d6a21e"},{"item":"k-cushion-chair","finish":"#d6a21e"},{"item":"k-cushion-chair","finish":"#d6a21e"},{"item":"k-cushion-chair","finish":"#d6a21e"},{"item":"k-centre-table","finish":"#a9744f"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-radio-set","finish":"#d94a4a"},{"item":"k-flat-tv","finish":"#3a3a3c"},{"item":"k-dining-table","finish":"#8a3b2a"}]', 9),
('benin-royal', 'Benin Royal', '👑', 'Bronze and coral beads. Oba of your own room.', 'peach-glow', 'terracotta',
 '[{"item":"k-spring-bed","finish":"#8a3b2a"},{"item":"k-sofa-chaise","finish":"#9d2a4a"},{"item":"k-armchair","finish":"#d6a21e"},{"item":"k-armchair","finish":"#d6a21e"},{"item":"k-dining-table","finish":"#8a3b2a"},{"item":"k-bookcase-doors","finish":"#8a3b2a"},{"item":"k-centre-table","finish":"#8a3b2a"},{"item":"k-floor-lamp-round","finish":"#fde08a"},{"item":"k-floor-lamp-round","finish":"#fde08a"},{"item":"k-house-plant","finish":null}]', 10),
('ekpoma-big-boy', 'Ekpoma Big Boy', '💰', 'Gold walls, black leather, loud speakers. Landlord dey fear you.', 'owambe-gold', 'black-marble',
 '[{"item":"k-spring-bed","finish":"#4b3a33"},{"item":"k-sofa-designer","finish":"#d6a21e"},{"item":"k-recliner","finish":"#3a3a3c"},{"item":"k-flat-tv","finish":"#3a3a3c"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-speaker-tower","finish":"#3a3a3c"},{"item":"k-double-door-fridge","finish":"#3a3a3c"},{"item":"k-glass-centre-table","finish":"#4b3a33"},{"item":"k-floor-lamp-round","finish":"#fde08a"}]', 11),
('igbinedion-luxury', 'Igbinedion Road Luxury', '🏰', 'Corner sofa, marble floor, bathtub. Na who dey rent here?', 'classic-cream', 'white-marble',
 '[{"item":"k-spring-bed","finish":"#8a3b2a"},{"item":"k-sofa-corner","finish":"#9ca3af"},{"item":"k-flat-tv","finish":"#cfd4da"},{"item":"k-double-door-fridge","finish":"#cfd4da"},{"item":"k-dining-table","finish":"#8a3b2a"},{"item":"k-electric-cooker","finish":"#cfd4da"},{"item":"k-cooker-hood","finish":"#cfd4da"},{"item":"k-washing-machine","finish":"#cfd4da"},{"item":"k-bathtub","finish":"#f1e4c3"},{"item":"k-shower-cubicle","finish":"#a5d0ee"}]', 12)
ON CONFLICT (id) DO NOTHING;
