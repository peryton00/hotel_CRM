-- ==============================================================================
-- HOTEL_CRM: Development & Testing Mock Data
-- File: supabase/mock_data.sql
-- Description: Rich, realistic sample dataset for local and staging development.
--              Populates tables, staff, menu catalog, inventory, recipes,
--              customers, coupons, live & completed orders, payments, invoices,
--              reservations, and feedback for 'Gurukripa Dhaba'.
-- ==============================================================================

DO $$
DECLARE
    v_restaurant_id UUID := '00000000-0000-0000-0000-000000000001';

    -- Category IDs
    v_cat_starters UUID := '22222222-0000-0000-0000-000000000001';
    v_cat_mains UUID    := '22222222-0000-0000-0000-000000000002';
    v_cat_breads UUID   := '22222222-0000-0000-0000-000000000003';
    v_cat_rice UUID     := '22222222-0000-0000-0000-000000000004';
    v_cat_drinks UUID   := '22222222-0000-0000-0000-000000000005';
    v_cat_desserts UUID := '22222222-0000-0000-0000-000000000006';

    -- Staff IDs
    v_staff_manager UUID := '44444444-0000-0000-0000-000000000002';
    v_staff_cashier UUID := '44444444-0000-0000-0000-000000000003';
    v_staff_captain UUID := '44444444-0000-0000-0000-000000000004';
    v_staff_chef    UUID := '44444444-0000-0000-0000-000000000005';

    -- Customer IDs
    v_cust_1 UUID := '55555555-0000-0000-0000-000000000001';
    v_cust_2 UUID := '55555555-0000-0000-0000-000000000002';
    v_cust_3 UUID := '55555555-0000-0000-0000-000000000003';

    -- Table IDs
    v_tbl_01 UUID := '11111111-0000-0000-0000-000000000001';
    v_tbl_02 UUID := '11111111-0000-0000-0000-000000000002';
    v_tbl_03 UUID := '11111111-0000-0000-0000-000000000003';
    v_tbl_04 UUID := '11111111-0000-0000-0000-000000000004';
    v_tbl_07 UUID := '11111111-0000-0000-0000-000000000007';

    -- Order IDs
    v_order_completed UUID := '77777777-0000-0000-0000-000000000001';
    v_order_active    UUID := '77777777-0000-0000-0000-000000000002';

BEGIN

    -- --------------------------------------------------------------------------
    -- 1. OPERATIONAL STAFF MEMBERS (Different Roles & Checkbox Permissions)
    -- --------------------------------------------------------------------------
    INSERT INTO staff_members (
        id, restaurant_id, name, role, email, login_id, pin_hash, phone, phone_e164, is_active, shift, assigned_section, permissions
    ) VALUES
    (
        v_staff_manager, v_restaurant_id, 'Harpreet Singh', 'MANAGER', 'harpreet@gurukripadhaba.in', 'manager', '1234',
        '+91 98765 11111', '+919876511111', true, 'Morning Shift', 'Floor Management',
        '["pos:orders:create","pos:orders:edit","pos:discounts:apply","pos:bills:settle","kitchen:kot:fire","menu:availability:toggle","reports:daily:view","reports:export:download"]'::jsonb
    ),
    (
        v_staff_cashier, v_restaurant_id, 'Rajat Sharma', 'CASHIER', 'rajat@gurukripadhaba.in', 'cashier', '1234',
        '+91 98765 22222', '+919876522222', true, 'Full Day Shift', 'Cash & Billing Counter',
        '["pos:orders:create","pos:bills:settle","pos:bills:reprint","kitchen:kot:fire","menu:availability:toggle"]'::jsonb
    ),
    (
        v_staff_captain, v_restaurant_id, 'Gurpreet Kaur', 'CAPTAIN', 'gurpreet@gurukripadhaba.in', 'captain', '1234',
        '+91 98765 33333', '+919876533333', true, 'Evening Shift', 'Main Dining Hall',
        '["pos:orders:create","kitchen:kot:fire","menu:availability:toggle"]'::jsonb
    ),
    (
        v_staff_chef, v_restaurant_id, 'Vikramjit Singh', 'HEAD CHEF (KDS)', 'chef@gurukripadhaba.in', 'chef', '1234',
        '+91 98765 44444', '+919876544444', true, 'Kitchen Operations', 'Main Hot Kitchen',
        '["kitchen:kot:fire","kitchen:kot:bump","menu:availability:toggle","inventory:stock:adjust"]'::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        permissions = EXCLUDED.permissions;

    -- --------------------------------------------------------------------------
    -- 2. DINING TABLES ACROSS SECTIONS
    -- --------------------------------------------------------------------------
    INSERT INTO tables (id, restaurant_id, number, table_number, capacity, section, qr_token, qr_code_identifier, status, ordering_enabled)
    VALUES
        (v_tbl_01, v_restaurant_id, 'T-01', 'tbl-01', 4, 'Main Hall', 'tbl-01', 'tbl-01', 'AVAILABLE', true),
        (v_tbl_02, v_restaurant_id, 'T-02', 'tbl-02', 2, 'Main Hall', 'tbl-02', 'tbl-02', 'AVAILABLE', true),
        (v_tbl_03, v_restaurant_id, 'T-03', 'tbl-03', 6, 'Family Section', 'tbl-03', 'tbl-03', 'OCCUPIED', true),
        (v_tbl_04, v_restaurant_id, 'T-04', 'tbl-04', 4, 'Garden Terrace', 'tbl-04', 'tbl-04', 'AVAILABLE', true),
        ('11111111-0000-0000-0000-000000000005', v_restaurant_id, 'T-05', 'tbl-05', 4, 'Garden Terrace', 'tbl-05', 'tbl-05', 'AVAILABLE', true),
        ('11111111-0000-0000-0000-000000000006', v_restaurant_id, 'T-06', 'tbl-06', 8, 'Family Section', 'tbl-06', 'tbl-06', 'RESERVED', true),
        (v_tbl_07, v_restaurant_id, 'T-07', 'tbl-07', 4, 'VIP Lounge', 'tbl-07', 'tbl-07', 'AVAILABLE', true),
        ('11111111-0000-0000-0000-000000000008', v_restaurant_id, 'T-08', 'tbl-08', 6, 'VIP Lounge', 'tbl-08', 'tbl-08', 'AVAILABLE', true)
    ON CONFLICT (id) DO UPDATE SET
        table_number = EXCLUDED.table_number,
        status = EXCLUDED.status;

    -- --------------------------------------------------------------------------
    -- 3. MENU CATEGORIES
    -- --------------------------------------------------------------------------
    INSERT INTO menu_categories (id, restaurant_id, name, slug, description, sort_order, display_order, is_active)
    VALUES
        (v_cat_starters, v_restaurant_id, 'Starters & Tandoori', 'starters', 'Charcoal roasted kebabs, tikkas and crispy bites', 1, 1, true),
        (v_cat_mains,    v_restaurant_id, 'Main Course Curries', 'main-course', 'Rich and hearty North Indian gravies & dals', 2, 2, true),
        (v_cat_breads,   v_restaurant_id, 'Tandoori Breads', 'breads', 'Freshly baked flatbreads from the clay oven', 3, 3, true),
        (v_cat_rice,     v_restaurant_id, 'Rice & Dum Biryani', 'rice-biryani', 'Aromatic aged basmati rice preparations', 4, 4, true),
        (v_cat_drinks,   v_restaurant_id, 'Lassi & Beverages', 'beverages', 'Traditional churned drinks and refreshments', 5, 5, true),
        (v_cat_desserts, v_restaurant_id, 'Desserts & Sweets', 'desserts', 'Classic warm and chilled Indian sweets', 6, 6, true)
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description;

    -- --------------------------------------------------------------------------
    -- 4. MENU ITEMS
    -- --------------------------------------------------------------------------
    INSERT INTO menu_items (
        id, restaurant_id, category_id, name, description, price_paise, base_price_paise,
        tax_rate_percent, dietary, is_veg, is_available, display_order, preparation_time_minutes, image_url
    ) VALUES
        -- Starters
        ('33333333-0000-0000-0000-000000000001', v_restaurant_id, v_cat_starters, 'Paneer Tikka Angara',
         'Succulent cubes of fresh cottage cheese marinated in hung curd, Kashmiri chili, and roasted spices.',
         28000, 28000, 5.0, 'VEG', true, true, 1, 15, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600'),

        ('33333333-0000-0000-0000-000000000002', v_restaurant_id, v_cat_starters, 'Crispy Corn Salt & Pepper',
         'Golden fried sweet corn kernels tossed with crushed black pepper, spring onions, and bell peppers.',
         22000, 22000, 5.0, 'VEG', true, true, 2, 12, 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600'),

        ('33333333-0000-0000-0000-000000000003', v_restaurant_id, v_cat_starters, 'Dahi Ke Kebab',
         'Melt-in-mouth kebabs made with hung yogurt, fresh coriander, cardamom, and subtle herbs.',
         26000, 26000, 5.0, 'VEG', true, true, 3, 14, 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600'),

        -- Main Course
        ('33333333-0000-0000-0000-000000000004', v_restaurant_id, v_cat_mains, 'Dal Makhani Shahi Special',
         'Signature black lentils simmered overnight on slow charcoal fire, finished with white butter and fresh cream.',
         32000, 32000, 5.0, 'VEG', true, true, 1, 20, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600'),

        ('33333333-0000-0000-0000-000000000005', v_restaurant_id, v_cat_mains, 'Paneer Butter Masala',
         'Soft paneer cubes simmered in a velvety, buttery tomato gravy infused with kasuri methi.',
         34000, 34000, 5.0, 'VEG', true, true, 2, 15, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600'),

        ('33333333-0000-0000-0000-000000000006', v_restaurant_id, v_cat_mains, 'Kadhai Paneer Dhaba Style',
         'Cottage cheese chunks cooked with freshly ground coriander seeds, dry red chilies, and bell peppers.',
         33000, 33000, 5.0, 'VEG', true, true, 3, 15, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600'),

        -- Breads
        ('33333333-0000-0000-0000-000000000007', v_restaurant_id, v_cat_breads, 'Butter Garlic Naan',
         'Fine flour flatbread studded with roasted garlic and brushed generously with churned butter.',
         6000, 6000, 5.0, 'VEG', true, true, 1, 8, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600'),

        ('33333333-0000-0000-0000-000000000008', v_restaurant_id, v_cat_breads, 'Tandoori Roti with Butter',
         'Whole wheat flatbread baked in traditional clay tandoor, brushed with desi ghee.',
         2500, 2500, 5.0, 'VEG', true, true, 2, 5, 'https://images.unsplash.com/photo-1505253758473-96b3d5ebcd69?w=600'),

        ('33333333-0000-0000-0000-000000000009', v_restaurant_id, v_cat_breads, 'Lachha Paratha',
         'Multi-layered flaky whole wheat bread baked in tandoor with aromatic ajwain.',
         5000, 5000, 5.0, 'VEG', true, true, 3, 8, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600'),

        -- Rice & Biryani
        ('33333333-0000-0000-0000-000000000010', v_restaurant_id, v_cat_rice, 'Jeera Rice Special',
         'Long-grain fragrant basmati rice tempered with roasted cumin seeds and desi ghee.',
         18000, 18000, 5.0, 'VEG', true, true, 1, 10, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=600'),

        ('33333333-0000-0000-0000-000000000011', v_restaurant_id, v_cat_rice, 'Subz Dum Biryani Handi',
         'Layers of spiced garden vegetables and aged basmati rice slow-cooked in sealed clay handi.',
         29000, 29000, 5.0, 'VEG', true, true, 2, 20, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600'),

        -- Beverages
        ('33333333-0000-0000-0000-000000000012', v_restaurant_id, v_cat_drinks, 'Amritsari Malai Lassi (Sweet)',
         'Chilled sweet churned yogurt served in earthen kulhad, crowned with thick malai and pistachios.',
         12000, 12000, 5.0, 'VEG', true, true, 1, 5, 'https://images.unsplash.com/photo-1571006687694-733e08f51a44?w=600'),

        ('33333333-0000-0000-0000-000000000013', v_restaurant_id, v_cat_drinks, 'Masala Buttermilk / Chaas',
         'Refreshing churned buttermilk infused with roasted cumin, mint, ginger, and black salt.',
         6000, 6000, 5.0, 'VEG', true, true, 2, 5, 'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600'),

        -- Desserts
        ('33333333-0000-0000-0000-000000000014', v_restaurant_id, v_cat_desserts, 'Hot Gulab Jamun (2 Pcs)',
         'Deep fried golden dumplings soaked in warm rose and green cardamom scented sugar syrup.',
         9000, 9000, 5.0, 'VEG', true, true, 1, 5, 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600'),

        ('33333333-0000-0000-0000-000000000015', v_restaurant_id, v_cat_desserts, 'Kesar Rasmalai (2 Pcs)',
         'Spongy cottage cheese patties steeped in saffron and pistachio laced reduced milk rabdi.',
         14000, 14000, 5.0, 'VEG', true, true, 2, 5, 'https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=600')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        price_paise = EXCLUDED.price_paise,
        description = EXCLUDED.description;

    -- --------------------------------------------------------------------------
    -- 5. INVENTORY & INGREDIENTS
    -- --------------------------------------------------------------------------
    INSERT INTO inventory_items (
        id, restaurant_id, name, sku, unit_of_measure, current_stock, reorder_level, cost_per_unit_paise, is_active
    ) VALUES
        ('66666666-0000-0000-0000-000000000001', v_restaurant_id, 'Fresh Malai Paneer', 'INV-PAN-01', 'kg', 24.5000, 10.0000, 32000, true),
        ('66666666-0000-0000-0000-000000000002', v_restaurant_id, 'Black Urad Dal (Whole)', 'INV-DAL-01', 'kg', 45.0000, 15.0000, 11000, true),
        ('66666666-0000-0000-0000-000000000003', v_restaurant_id, 'Amul Table Butter', 'INV-BUT-01', 'kg', 18.0000, 5.0000, 52000, true),
        ('66666666-0000-0000-0000-000000000004', v_restaurant_id, 'Fresh Dairy Cream', 'INV-CRM-01', 'liter', 12.0000, 4.0000, 24000, true),
        ('66666666-0000-0000-0000-000000000005', v_restaurant_id, 'Aged Basmati Rice', 'INV-RIC-01', 'kg', 60.0000, 20.0000, 13000, true),
        ('66666666-0000-0000-0000-000000000006', v_restaurant_id, 'Whole Wheat Chakki Atta', 'INV-FLR-01', 'kg', 85.0000, 25.0000, 4200, true),
        ('66666666-0000-0000-0000-000000000007', v_restaurant_id, 'Pure Cow Desi Ghee', 'INV-GHE-01', 'liter', 15.0000, 5.0000, 65000, true)
    ON CONFLICT (id) DO UPDATE SET
        current_stock = EXCLUDED.current_stock;

    -- Recipes for automatic consumption
    INSERT INTO recipes (id, restaurant_id, menu_item_id, yield_servings, instructions)
    VALUES
        ('88888888-0000-0000-0000-000000000001', v_restaurant_id, '33333333-0000-0000-0000-000000000004', 1.0, 'Add 150g boiled dal, 30g butter, 20ml cream.'),
        ('88888888-0000-0000-0000-000000000002', v_restaurant_id, '33333333-0000-0000-0000-000000000005', 1.0, 'Dice 200g paneer, sauté in tomato gravy with 25g butter and 15ml cream.')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO recipe_ingredients (id, recipe_id, inventory_item_id, quantity_required, unit_of_measure)
    VALUES
        ('99999999-0000-0000-0000-000000000001', '88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 0.1500, 'kg'),
        ('99999999-0000-0000-0000-000000000002', '88888888-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000003', 0.0300, 'kg'),
        ('99999999-0000-0000-0000-000000000003', '88888888-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', 0.2000, 'kg')
    ON CONFLICT (id) DO NOTHING;

    -- --------------------------------------------------------------------------
    -- 6. CUSTOMER PROFILES & LOYALTY
    -- --------------------------------------------------------------------------
    INSERT INTO customers (
        id, restaurant_id, name, phone, phone_e164, email, status, loyalty_tier, loyalty_points, total_orders, total_spent_paise, address
    ) VALUES
    (
        v_cust_1, v_restaurant_id, 'Vikram Malhotra', '9811122334', '+919811122334', 'vikram.m@gmail.com',
        'VIP', 'GOLD', 480, 12, 1845000, 'House 42, Civil Lines, Ludhiana'
    ),
    (
        v_cust_2, v_restaurant_id, 'Simran Patel', '9822233445', '+919822233445', 'simran.p@outlook.com',
        'ACTIVE', 'SILVER', 190, 5, 680000, 'Flat 302, Model Town, Ludhiana'
    ),
    (
        v_cust_3, v_restaurant_id, 'Rohit Verma', '9833344556', '+919833344556', 'rohit.v@gmail.com',
        'ACTIVE', 'BRONZE', 60, 2, 240000, 'Sarabha Nagar, Ludhiana'
    )
    ON CONFLICT (id) DO UPDATE SET
        loyalty_points = EXCLUDED.loyalty_points,
        total_orders = EXCLUDED.total_orders;

    -- --------------------------------------------------------------------------
    -- 7. PROMOTIONS & DISCOUNT COUPONS
    -- --------------------------------------------------------------------------
    INSERT INTO coupons (
        id, restaurant_id, code, title, description, discount_type, discount_value,
        discount_value_paise, discount_percentage, min_order_amount_paise, min_order_value_paise,
        max_discount_paise, max_discount_amount_paise, one_time_per_customer, is_targeted, is_active
    ) VALUES
    (
        'aaaaaaa1-0000-0000-0000-000000000001', v_restaurant_id, 'WELCOME50', 'Welcome Treat',
        'Flat 50% discount up to ₹150 on your inaugural dining experience.',
        'PERCENTAGE', 50.0, 0, 50.0, 30000, 30000, 15000, 15000, true, false, true
    ),
    (
        'aaaaaaa1-0000-0000-0000-000000000002', v_restaurant_id, 'WEEKEND20', 'Weekend Family Feast',
        '20% discount on table billing above ₹600.',
        'PERCENTAGE', 20.0, 0, 20.0, 60000, 60000, 25000, 25000, false, false, true
    ),
    (
        'aaaaaaa1-0000-0000-0000-000000000003', v_restaurant_id, 'DESI100', 'Flat ₹100 Off',
        'Direct ₹100 instant bill reduction on orders above ₹800.',
        'FIXED', 100.0, 10000, 0.0, 80000, 80000, 10000, 10000, false, false, true
    )
    ON CONFLICT (id) DO UPDATE SET
        is_active = true;

    -- --------------------------------------------------------------------------
    -- 8. COMPLETED & SETTLED ORDER (Table T-01)
    -- --------------------------------------------------------------------------
    INSERT INTO orders (
        id, restaurant_id, table_id, customer_id, customer_name, customer_phone_e164,
        order_type, status, payment_status, subtotal_paise, discount_paise, tax_paise,
        service_charge_paise, round_off_paise, total_amount_paise, notes, server_staff_id, created_at
    ) VALUES (
        v_order_completed, v_restaurant_id, v_tbl_01, v_cust_1, 'Vikram Malhotra', '+919811122334',
        'DINE_IN', 'COMPLETED', 'PAID', 78000, 10000, 3400, 0, 0, 71400,
        'Regular patron. Prefers low spice on dal makhani.', v_staff_captain, NOW() - INTERVAL '2 hours'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO order_items (
        id, order_id, menu_item_id, name, unit_price_paise, quantity, item_total_paise,
        subtotal_paise, tax_paise, discount_paise, total_paise, status
    ) VALUES
        ('bbbbbbbb-0000-0000-0000-000000000001', v_order_completed, '33333333-0000-0000-0000-000000000004', 'Dal Makhani Shahi Special', 32000, 1, 32000, 32000, 1600, 0, 33600, 'served'),
        ('bbbbbbbb-0000-0000-0000-000000000002', v_order_completed, '33333333-0000-0000-0000-000000000005', 'Paneer Butter Masala', 34000, 1, 34000, 34000, 1700, 0, 35700, 'served'),
        ('bbbbbbbb-0000-0000-0000-000000000003', v_order_completed, '33333333-0000-0000-0000-000000000007', 'Butter Garlic Naan', 6000, 2, 12000, 12000, 600, 0, 12600, 'served')
    ON CONFLICT (id) DO NOTHING;

    -- Payment for settled order
    INSERT INTO payments (
        id, restaurant_id, order_id, amount_paise, payment_method, status, upi_transaction_ref, created_at
    ) VALUES (
        'cccccccc-0000-0000-0000-000000000001', v_restaurant_id, v_order_completed, 71400, 'UPI', 'COMPLETED', 'UPI/20261109/9847192', NOW() - INTERVAL '1 hour 45 minutes'
    ) ON CONFLICT (id) DO NOTHING;

    -- Invoice for settled order
    INSERT INTO invoices (
        id, restaurant_id, order_id, invoice_number, subtotal_paise, tax_paise, discount_paise, round_off_paise, total_paise, created_at
    ) VALUES (
        'dddddddd-0000-0000-0000-000000000001', v_restaurant_id, v_order_completed, 'INV-2026-00101', 78000, 3400, 10000, 0, 71400, NOW() - INTERVAL '1 hour 45 minutes'
    ) ON CONFLICT (id) DO NOTHING;

    -- --------------------------------------------------------------------------
    -- 9. LIVE ACTIVE ORDER IN KITCHEN (Table T-03)
    -- --------------------------------------------------------------------------
    INSERT INTO orders (
        id, restaurant_id, table_id, customer_id, customer_name, customer_phone_e164,
        order_type, status, payment_status, subtotal_paise, discount_paise, tax_paise,
        service_charge_paise, round_off_paise, total_amount_paise, notes, server_staff_id, created_at
    ) VALUES (
        v_order_active, v_restaurant_id, v_tbl_03, v_cust_2, 'Simran Patel', '+919822233445',
        'DINE_IN', 'PREPARING', 'UNPAID', 56000, 0, 2800, 0, 0, 58800,
        'Extra crispy naan requested.', v_staff_captain, NOW() - INTERVAL '18 minutes'
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO order_items (
        id, order_id, menu_item_id, name, unit_price_paise, quantity, item_total_paise,
        subtotal_paise, tax_paise, discount_paise, total_paise, status
    ) VALUES
        ('bbbbbbbb-0000-0000-0000-000000000004', v_order_active, '33333333-0000-0000-0000-000000000001', 'Paneer Tikka Angara', 28000, 1, 28000, 28000, 1400, 0, 29400, 'preparing'),
        ('bbbbbbbb-0000-0000-0000-000000000005', v_order_active, '33333333-0000-0000-0000-000000000002', 'Crispy Corn Salt & Pepper', 22000, 1, 22000, 22000, 1100, 0, 23100, 'preparing'),
        ('bbbbbbbb-0000-0000-0000-000000000006', v_order_active, '33333333-0000-0000-0000-000000000007', 'Butter Garlic Naan', 6000, 1, 6000, 6000, 300, 0, 6300, 'confirmed')
    ON CONFLICT (id) DO NOTHING;

    -- --------------------------------------------------------------------------
    -- 10. RESERVATIONS
    -- --------------------------------------------------------------------------
    INSERT INTO reservations (
        id, restaurant_id, customer_id, customer_name, customer_phone, customer_phone_e164,
        party_size, guest_count, reservation_date, reservation_time, table_id, status, special_requests
    ) VALUES
    (
        'eeeeeeee-0000-0000-0000-000000000001', v_restaurant_id, v_cust_1, 'Vikram Malhotra',
        '9811122334', '+919811122334', 4, 4, CURRENT_DATE + INTERVAL '1 day', NOW() + INTERVAL '1 day 3 hours',
        v_tbl_07, 'CONFIRMED', 'Family anniversary dinner. Please reserve corner sofa.'
    ),
    (
        'eeeeeeee-0000-0000-0000-000000000002', v_restaurant_id, v_cust_2, 'Simran Patel',
        '9822233445', '+919822233445', 2, 2, CURRENT_DATE + INTERVAL '2 days', NOW() + INTERVAL '2 days 4 hours',
        v_tbl_02, 'CONFIRMED', 'Quiet table near window.'
    )
    ON CONFLICT (id) DO NOTHING;

    -- --------------------------------------------------------------------------
    -- 11. CUSTOMER FEEDBACK
    -- --------------------------------------------------------------------------
    INSERT INTO customer_feedback (id, restaurant_id, order_id, customer_id, rating, comments, created_at)
    VALUES
    (
        'ffffffff-0000-0000-0000-000000000001', v_restaurant_id, v_order_completed, v_cust_1, 5,
        'Authentic rich taste! Dal Makhani and Garlic Naan were superb as always. Very swift service.',
        NOW() - INTERVAL '1 hour'
    )
    ON CONFLICT (id) DO NOTHING;

END $$;
