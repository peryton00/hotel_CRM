-- ==============================================================================
-- 000_seed.sql: Canonical Seed Data for Local PostgreSQL
-- Part of HOTEL_CRM Desktop-First Offline Architecture
-- ==============================================================================

-- 1. Default Restaurant Root
INSERT INTO restaurants (
    id, slug, name, tagline, description, phone, email, address, city, state, postal_code,
    gstin, fssai_license, currency, currency_symbol, gst_rate, service_charge_rate, timezone, is_active
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'gurukripa-dhaba',
    'Gurukripa Dhaba',
    'Authentic Punjabi & North Indian Cuisine',
    'Serving authentic rich Punjabi delicacies since 1998.',
    '+91 98765 43210',
    'info@gurukripadhaba.in',
    'G.T. Road, Near Highway Plaza',
    'Ludhiana',
    'Punjab',
    '141001',
    '03AABCG1234F1Z5',
    '10019011000123',
    'INR',
    '₹',
    5.00,
    0.00,
    'Asia/Kolkata',
    true
) ON CONFLICT (id) DO UPDATE SET
    phone = COALESCE(restaurants.phone, EXCLUDED.phone),
    email = COALESCE(restaurants.email, EXCLUDED.email),
    address = COALESCE(restaurants.address, EXCLUDED.address),
    city = COALESCE(restaurants.city, EXCLUDED.city),
    state = COALESCE(restaurants.state, EXCLUDED.state),
    postal_code = COALESCE(restaurants.postal_code, EXCLUDED.postal_code),
    gstin = COALESCE(restaurants.gstin, EXCLUDED.gstin),
    fssai_license = COALESCE(restaurants.fssai_license, EXCLUDED.fssai_license);

-- 2. Default Dining Tables
INSERT INTO tables (id, restaurant_id, number, table_number, capacity, section, qr_token, qr_code_identifier, status, ordering_enabled)
VALUES
    ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'T-01', 'tbl-01', 4, 'Main Hall', 'tbl-01', 'tbl-01', 'AVAILABLE', true),
    ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'T-02', 'tbl-02', 2, 'Main Hall', 'tbl-02', 'tbl-02', 'AVAILABLE', true),
    ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'T-03', 'tbl-03', 6, 'Family Section', 'tbl-03', 'tbl-03', 'AVAILABLE', true),
    ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'T-04', 'tbl-04', 4, 'Garden Terrace', 'tbl-04', 'tbl-04', 'AVAILABLE', true),
    ('11111111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'T-07', 'tbl-07', 4, 'VIP Lounge', 'tbl-07', 'tbl-07', 'AVAILABLE', true)
ON CONFLICT (id) DO UPDATE SET
    table_number = EXCLUDED.table_number,
    qr_code_identifier = EXCLUDED.qr_code_identifier;

-- 3. Default Menu Categories
INSERT INTO menu_categories (id, restaurant_id, name, slug, sort_order, display_order, is_active)
VALUES
    ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Starters', 'starters', 1, 1, true),
    ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Course', 'main-course', 2, 2, true),
    ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Breads & Rice', 'breads-rice', 3, 3, true),
    ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Beverages & Desserts', 'beverages-desserts', 4, 4, true)
ON CONFLICT (id) DO NOTHING;

-- 4. Default Menu Items
INSERT INTO menu_items (
    id, restaurant_id, category_id, name, description, price_paise, base_price_paise,
    dietary, is_veg, is_available, preparation_time_minutes, image_url, display_order
) VALUES
    ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Paneer Tikka', 'Charcoal grilled cottage cheese marinated in spiced yogurt.', 28000, 28000, 'VEG', true, true, 15, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500', 1),
    ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Crispy Corn Salt & Pepper', 'Sweet corn kernels tossed with crushed pepper and spring onion.', 22000, 22000, 'VEG', true, true, 12, 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=500', 2),
    ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Dal Makhani Special', 'Slow cooked black lentils with churned butter and dairy cream.', 32000, 32000, 'VEG', true, true, 20, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500', 1),
    ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Paneer Butter Masala', 'Fresh cottage cheese cubes in rich velvety tomato cashew gravy.', 34000, 34000, 'VEG', true, true, 15, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500', 2),
    ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Butter Garlic Naan', 'Clay oven baked flatbread brushed with garlic butter.', 6000, 6000, 'VEG', true, true, 8, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500', 1),
    ('33333333-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'Special Amritsari Lassi', 'Chilled sweet churned yogurt topped with thick malai and pistachios.', 12000, 12000, 'VEG', true, true, 5, 'https://images.unsplash.com/photo-1571006687694-733e08f51a44?w=500', 1)
ON CONFLICT (id) DO NOTHING;

-- 5. Default Staff Admin
INSERT INTO staff_members (id, restaurant_id, name, role, email, login_id, pin_hash, phone, phone_e164, is_active, shift, assigned_section)
VALUES (
    '44444444-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Super Admin',
    'ADMIN',
    'admin@hotelcrm.com',
    'admin',
    'Admin@123',
    '+91 98765 43210',
    '+919876543210',
    true,
    'Management',
    'Executive HQ'
) ON CONFLICT (id) DO UPDATE SET
    login_id = COALESCE(staff_members.login_id, EXCLUDED.login_id),
    email = COALESCE(staff_members.email, EXCLUDED.email),
    phone = COALESCE(staff_members.phone, EXCLUDED.phone),
    shift = COALESCE(staff_members.shift, EXCLUDED.shift),
    assigned_section = COALESCE(staff_members.assigned_section, EXCLUDED.assigned_section);
