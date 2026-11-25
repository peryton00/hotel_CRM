-- Optional development preview after schema.sql. Matches the starter SQLite catalog.
-- Use before connecting a till. A connected till publishes its own menu and tables.
-- Guest checkout still requires a real device heartbeat and an open seating session.
BEGIN;
SELECT pg_advisory_xact_lock(718104521);
SET LOCAL search_path = public, pg_catalog;

INSERT INTO tables (id, restaurant_id, number, capacity, section, qr_token, qr_code_identifier, status, ordering_enabled)
VALUES
    ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'T-01', 4, 'Main Hall', 'tbl-01', 'tbl-01', 'AVAILABLE', TRUE),
    ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'T-02', 2, 'Main Hall', 'tbl-02', 'tbl-02', 'AVAILABLE', TRUE),
    ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'T-03', 6, 'Family Section', 'tbl-03', 'tbl-03', 'AVAILABLE', TRUE),
    ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'T-04', 4, 'Garden Terrace', 'tbl-04', 'tbl-04', 'AVAILABLE', TRUE),
    ('11111111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'T-07', 4, 'VIP Lounge', 'tbl-07', 'tbl-07', 'AVAILABLE', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Categories
INSERT INTO menu_categories (id, restaurant_id, name, slug, sort_order, display_order, is_active)
VALUES
    ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Starters', 'starters', 1, 1, TRUE),
    ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Course', 'main-course', 2, 2, TRUE),
    ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Breads & Rice', 'breads-rice', 3, 3, TRUE),
    ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Beverages & Desserts', 'beverages-desserts', 4, 4, TRUE)
ON CONFLICT (id) DO NOTHING;

-- Seed Menu Items
INSERT INTO menu_items (
    id, restaurant_id, category_id, name, description, price_paise, base_price_paise,
    dietary, is_veg, is_available, preparation_time_minutes, image_url, display_order
) VALUES
    ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Paneer Tikka', 'Charcoal grilled cottage cheese marinated in spiced yogurt.', 28000, 28000, 'VEG', TRUE, TRUE, 15, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500', 1),
    ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Crispy Corn Salt & Pepper', 'Sweet corn kernels tossed with crushed pepper and spring onion.', 22000, 22000, 'VEG', TRUE, TRUE, 12, 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=500', 2),
    ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Dal Makhani Special', 'Slow cooked black lentils with churned butter and dairy cream.', 32000, 32000, 'VEG', TRUE, TRUE, 20, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500', 1),
    ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Paneer Butter Masala', 'Fresh cottage cheese cubes in rich velvety tomato cashew gravy.', 34000, 34000, 'VEG', TRUE, TRUE, 15, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500', 2),
    ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Butter Garlic Naan', 'Clay oven baked flatbread brushed with garlic butter.', 6000, 6000, 'VEG', TRUE, TRUE, 8, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500', 1),
    ('33333333-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'Special Amritsari Lassi', 'Chilled sweet churned yogurt topped with thick malai and pistachios.', 12000, 12000, 'VEG', TRUE, TRUE, 5, 'https://images.unsplash.com/photo-1571006687694-733e08f51a44?w=500', 1)
ON CONFLICT (id) DO NOTHING;
COMMIT;
