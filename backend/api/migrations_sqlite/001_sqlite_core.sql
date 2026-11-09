-- ==============================================================================
-- 001_sqlite_core.sql: Embedded SQLite Schema for HOTEL_CRM Desktop Application
-- Zero External Dependency, Single File, Crash-Resilient Local Operational DB
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. RESTAURANTS
CREATE TABLE IF NOT EXISTS restaurants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    tagline TEXT,
    description TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    gstin TEXT,
    fssai_license TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    currency_symbol TEXT NOT NULL DEFAULT '₹',
    gst_rate REAL NOT NULL DEFAULT 5.00,
    service_charge_rate REAL NOT NULL DEFAULT 0.00,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. USERS & DYNAMIC RBAC (Linked to Supabase auth.users in Cloud)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CASHIER', -- 'ADMIN', 'MANAGER', 'CASHIER', 'CAPTAIN', 'KITCHEN'
    pin_hash TEXT,                       -- Salted PIN hash for offline quick POS unlock
    permissions TEXT NOT NULL DEFAULT '[]', -- JSON array of granted permission keys
    phone TEXT,
    shift TEXT DEFAULT 'General Shift',
    assigned_section TEXT DEFAULT 'Main Dining Floor',
    monthly_salary_paise INTEGER DEFAULT 1500000,
    payroll_cycle_start_day INTEGER DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_restaurant ON users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. TABLES
CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    table_number TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 4,
    section TEXT NOT NULL DEFAULT 'Main Hall',
    qr_token TEXT NOT NULL,
    qr_code_identifier TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'OCCUPIED', 'DIRTY', 'RESERVED'
    ordering_enabled INTEGER NOT NULL DEFAULT 1,
    active_order_id TEXT,
    assigned_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(restaurant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);

-- 4. MENU CATEGORIES & ITEMS
CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT,
    price_paise INTEGER NOT NULL,
    base_price_paise INTEGER NOT NULL,
    tax_rate_percent REAL NOT NULL DEFAULT 5.0,
    dietary TEXT NOT NULL DEFAULT 'VEG',
    is_veg INTEGER NOT NULL DEFAULT 1,
    is_available INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    preparation_time_minutes INTEGER NOT NULL DEFAULT 15,
    image_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items(category_id);

-- 5. ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id TEXT REFERENCES tables(id) ON DELETE SET NULL,
    customer_id TEXT,
    customer_name TEXT,
    customer_phone_e164 TEXT,
    order_type TEXT NOT NULL DEFAULT 'DINE_IN',
    status TEXT NOT NULL DEFAULT 'PENDING',
    payment_status TEXT NOT NULL DEFAULT 'UNPAID',
    subtotal_paise INTEGER NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    tax_paise INTEGER NOT NULL DEFAULT 0,
    service_charge_paise INTEGER NOT NULL DEFAULT 0,
    round_off_paise INTEGER NOT NULL DEFAULT 0,
    total_amount_paise INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    server_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    cancelled_at TEXT,
    legacy_unknown_timestamp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id TEXT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    item_total_paise INTEGER NOT NULL DEFAULT 0,
    subtotal_paise INTEGER NOT NULL DEFAULT 0,
    tax_paise INTEGER NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_timeline_events (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT,
    status TEXT,
    notes TEXT,
    performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 6. BILLING & PAYMENTS
CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    subtotal_paise INTEGER NOT NULL,
    tax_paise INTEGER NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    round_off_paise INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL,
    payment_method TEXT NOT NULL, -- 'CASH', 'UPI', 'CARD', 'SPLIT'
    status TEXT NOT NULL DEFAULT 'COMPLETED',
    upi_transaction_ref TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    legacy_unknown_timestamp INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- 7. INVENTORY & STOCK MOVEMENTS
CREATE TABLE IF NOT EXISTS inventory_items (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sku TEXT,
    unit_of_measure TEXT NOT NULL DEFAULT 'kg',
    current_stock REAL NOT NULL DEFAULT 0.0,
    reorder_level REAL NOT NULL DEFAULT 5.0,
    cost_per_unit_paise INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL, -- 'PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT'
    quantity REAL NOT NULL,
    balance_after REAL NOT NULL DEFAULT 0.0,
    reference_order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
    reference_wastage_id TEXT,
    notes TEXT,
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wastage_records (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity REAL NOT NULL,
    unit_of_measure TEXT NOT NULL,
    cost_impact_paise INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    reported_by_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 8. COUPONS & DISCOUNTS
CREATE TABLE IF NOT EXISTS coupons (
    id TEXT PRIMARY KEY,
    restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL DEFAULT 'PERCENTAGE',
    discount_value REAL NOT NULL DEFAULT 0.0,
    min_order_amount_paise INTEGER NOT NULL DEFAULT 0,
    max_discount_paise INTEGER,
    one_time_per_customer INTEGER NOT NULL DEFAULT 1,
    start_date TEXT NOT NULL DEFAULT (datetime('now')),
    end_date TEXT NOT NULL DEFAULT (datetime('now', '+1 year')),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id TEXT PRIMARY KEY,
    coupon_id TEXT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_phone TEXT,
    discount_applied_paise INTEGER NOT NULL DEFAULT 0,
    redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
    idempotency_key TEXT
);

-- 9. SYNCHRONIZATION OUTBOX & INBOX (Offline-First Sync Engine)
CREATE TABLE IF NOT EXISTS sync_outbox (
    event_id TEXT PRIMARY KEY,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON string
    version INTEGER NOT NULL DEFAULT 1,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS sync_inbox (
    inbox_id TEXT PRIMARY KEY,
    source_origin TEXT NOT NULL DEFAULT 'SUPABASE_CLOUD',
    event_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON string
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending ON sync_inbox(status, received_at);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
    id TEXT PRIMARY KEY,
    last_synced_event_id TEXT,
    last_synced_timestamp TEXT,
    last_attempt_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'IDLE',
    details TEXT
);

-- 10. CANONICAL INITIAL SEED DATA
INSERT OR IGNORE INTO restaurants (
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
    1
);

-- Default Super Admin (All Permissions)
INSERT OR IGNORE INTO users (
    id, restaurant_id, email, name, role, pin_hash, permissions, phone, shift, assigned_section, is_active
) VALUES (
    '44444444-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@hotelcrm.com',
    'Super Admin',
    'ADMIN',
    'Admin@123',
    '["*"]',
    '+91 98765 43210',
    'Management',
    'Executive HQ',
    1
);

-- Default Cashier Staff (POS Billing & KOT)
INSERT OR IGNORE INTO users (
    id, restaurant_id, email, name, role, pin_hash, permissions, phone, shift, assigned_section, is_active
) VALUES (
    '44444444-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'cashier@hotelcrm.com',
    'Harpreet Singh',
    'CASHIER',
    '1234',
    '["pos:orders:create","pos:bills:settle","kitchen:kot:fire","menu:availability:toggle"]',
    '+91 98765 43211',
    'Morning Shift',
    'Billing Counter',
    1
);

-- Seed Tables
INSERT OR IGNORE INTO tables (id, restaurant_id, number, table_number, capacity, section, qr_token, qr_code_identifier, status, ordering_enabled)
VALUES
    ('11111111-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'T-01', 'tbl-01', 4, 'Main Hall', 'tbl-01', 'tbl-01', 'AVAILABLE', 1),
    ('11111111-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'T-02', 'tbl-02', 2, 'Main Hall', 'tbl-02', 'tbl-02', 'AVAILABLE', 1),
    ('11111111-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'T-03', 'tbl-03', 6, 'Family Section', 'tbl-03', 'tbl-03', 'AVAILABLE', 1),
    ('11111111-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'T-04', 'tbl-04', 4, 'Garden Terrace', 'tbl-04', 'tbl-04', 'AVAILABLE', 1),
    ('11111111-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'T-07', 'tbl-07', 4, 'VIP Lounge', 'tbl-07', 'tbl-07', 'AVAILABLE', 1);

-- Seed Categories
INSERT OR IGNORE INTO menu_categories (id, restaurant_id, name, slug, sort_order, display_order, is_active)
VALUES
    ('22222222-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Starters', 'starters', 1, 1, 1),
    ('22222222-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Main Course', 'main-course', 2, 2, 1),
    ('22222222-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Breads & Rice', 'breads-rice', 3, 3, 1),
    ('22222222-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Beverages & Desserts', 'beverages-desserts', 4, 4, 1);

-- Seed Menu Items
INSERT OR IGNORE INTO menu_items (
    id, restaurant_id, category_id, name, description, price_paise, base_price_paise,
    dietary, is_veg, is_available, preparation_time_minutes, image_url, display_order
) VALUES
    ('33333333-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Paneer Tikka', 'Charcoal grilled cottage cheese marinated in spiced yogurt.', 28000, 28000, 'VEG', 1, 1, 15, 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=500', 1),
    ('33333333-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'Crispy Corn Salt & Pepper', 'Sweet corn kernels tossed with crushed pepper and spring onion.', 22000, 22000, 'VEG', 1, 1, 12, 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=500', 2),
    ('33333333-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Dal Makhani Special', 'Slow cooked black lentils with churned butter and dairy cream.', 32000, 32000, 'VEG', 1, 1, 20, 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500', 1),
    ('33333333-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'Paneer Butter Masala', 'Fresh cottage cheese cubes in rich velvety tomato cashew gravy.', 34000, 34000, 'VEG', 1, 1, 15, 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500', 2),
    ('33333333-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'Butter Garlic Naan', 'Clay oven baked flatbread brushed with garlic butter.', 6000, 6000, 'VEG', 1, 1, 8, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=500', 1),
    ('33333333-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'Special Amritsari Lassi', 'Chilled sweet churned yogurt topped with thick malai and pistachios.', 12000, 12000, 'VEG', 1, 1, 5, 'https://images.unsplash.com/photo-1571006687694-733e08f51a44?w=500', 1);
