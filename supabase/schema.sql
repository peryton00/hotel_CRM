-- ==============================================================================
-- HOTEL_CRM: Master Complete Database Schema
-- File: supabase/schema.sql
-- Description: Single-file idempotent database definition for Supabase PostgreSQL.
--              Contains extensions, enums, all operational tables, indexes,
--              Row Level Security (RLS) policies, triggers, helper functions,
--              and the root bootstrap administrative entity.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. CUSTOM ENUM TYPES
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE order_type AS ENUM ('DINE_IN', 'TAKEAWAY');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE table_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'RESERVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE customer_status AS ENUM ('ACTIVE', 'VIP', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE loyalty_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE actor_role AS ENUM ('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN', 'SYSTEM');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 3. CORE ENTITIES & TABLES
-- ------------------------------------------------------------------------------

-- 3.1 RESTAURANTS (Tenant Root)
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255),
    description TEXT,
    phone VARCHAR(50),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    gstin VARCHAR(50),
    fssai_license VARCHAR(50),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    currency_symbol VARCHAR(5) NOT NULL DEFAULT '₹',
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    service_charge_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.2 USERS & GRANULAR RBAC (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY, -- References auth.users(id)
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'CASHIER', -- 'ADMIN', 'MANAGER', 'CASHIER', 'CAPTAIN', 'KITCHEN'
    pin_hash VARCHAR(255),
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    phone VARCHAR(50),
    shift VARCHAR(100) DEFAULT 'General Shift',
    assigned_section VARCHAR(100) DEFAULT 'Main Dining Floor',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_restaurant_role ON public.users(restaurant_id, role);

-- 3.3 STAFF MEMBERS & ATTENDANCE
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    auth_user_id UUID,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'STAFF',
    pin_hash VARCHAR(255) NOT NULL,
    login_id VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(50),
    phone_e164 VARCHAR(20),
    shift VARCHAR(100) DEFAULT 'General Shift',
    assigned_section VARCHAR(100) DEFAULT 'Main Dining Floor',
    monthly_salary_paise BIGINT DEFAULT 1500000,
    payroll_cycle_start_day INT DEFAULT 1,
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON staff_members(restaurant_id);

CREATE TABLE IF NOT EXISTS staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_staff_attendance UNIQUE (restaurant_id, staff_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON staff_attendance(staff_id, attendance_date);

-- 3.4 CUSTOMERS & AUTH CHALLENGES
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(20),
    phone VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    status customer_status NOT NULL DEFAULT 'ACTIVE',
    loyalty_tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
    loyalty_points INT NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    total_spent_paise BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS customer_auth_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_phone ON customer_auth_challenges(phone_e164, is_verified);

-- 3.5 TABLES & TRANSFERS
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL,
    table_number VARCHAR(20),
    capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
    section VARCHAR(50) NOT NULL DEFAULT 'Main Dining',
    qr_token VARCHAR(64) NOT NULL UNIQUE,
    qr_code_identifier VARCHAR(64),
    status table_status NOT NULL DEFAULT 'AVAILABLE',
    ordering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    active_order_id UUID,
    assigned_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_number UNIQUE (restaurant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);

CREATE TABLE IF NOT EXISTS table_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    source_table_id UUID NOT NULL REFERENCES tables(id),
    destination_table_id UUID NOT NULL REFERENCES tables(id),
    staff_name VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.6 MENU CATEGORIES & ITEMS
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_category_slug UNIQUE (restaurant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_menu_categories_lookup ON menu_categories(restaurant_id, sort_order);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
    base_price_paise BIGINT,
    tax_rate_percent NUMERIC(5,2) DEFAULT 5.0,
    dietary VARCHAR(20) NOT NULL DEFAULT 'VEG',
    is_veg BOOLEAN DEFAULT TRUE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT DEFAULT 0,
    preparation_time_minutes INT DEFAULT 15,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_availability ON menu_items(restaurant_id, is_available);

-- 3.7 ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    customer_phone_e164 VARCHAR(20),
    order_type VARCHAR(50) NOT NULL DEFAULT 'DINE_IN',
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    service_charge_paise BIGINT NOT NULL DEFAULT 0 CHECK (service_charge_paise >= 0),
    round_off_paise BIGINT NOT NULL DEFAULT 0,
    total_amount_paise BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    server_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    legacy_unknown_timestamp BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    item_total_paise BIGINT NOT NULL DEFAULT 0,
    subtotal_paise BIGINT NOT NULL DEFAULT 0,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    discount_paise BIGINT NOT NULL DEFAULT 0,
    total_paise BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    status VARCHAR(50),
    notes TEXT,
    performed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline_events(order_id);

-- 3.8 BILLING, PAYMENTS & REFUNDS
CREATE TABLE IF NOT EXISTS split_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_index INT NOT NULL,
    total_splits INT NOT NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    status payment_status NOT NULL DEFAULT 'UNPAID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS split_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    allocated_paise BIGINT NOT NULL CHECK (allocated_paise > 0)
);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_method VARCHAR(50) NOT NULL, -- 'CASH', 'UPI', 'CARD', 'SPLIT'
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    upi_transaction_ref VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_unknown_timestamp BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL,
    authorized_by UUID REFERENCES staff_members(id),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL UNIQUE,
    subtotal_paise BIGINT NOT NULL,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    discount_paise BIGINT NOT NULL DEFAULT 0,
    round_off_paise BIGINT NOT NULL DEFAULT 0,
    total_paise BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

CREATE TABLE IF NOT EXISTS invoice_prints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    printed_by UUID REFERENCES staff_members(id),
    reprint_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.9 INVENTORY & RECIPES
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50),
    unit_of_measure VARCHAR(20) NOT NULL DEFAULT 'kg',
    current_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    reorder_level NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    cost_per_unit_paise BIGINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_restaurant ON inventory_items(restaurant_id);

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    yield_servings NUMERIC(8, 2) NOT NULL DEFAULT 1.00,
    instructions TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recipe_menu_item UNIQUE (restaurant_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity_required NUMERIC(12, 4) NOT NULL CHECK (quantity_required > 0),
    unit_of_measure VARCHAR(20) NOT NULL,
    CONSTRAINT uq_recipe_ingredient UNIQUE (recipe_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    movement_type VARCHAR(30) NOT NULL, -- 'PURCHASE', 'CONSUMPTION', 'WASTAGE', 'ADJUSTMENT'
    quantity NUMERIC(12, 4) NOT NULL,
    balance_after NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reference_wastage_id UUID,
    notes TEXT,
    idempotency_key VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id);

CREATE TABLE IF NOT EXISTS wastage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit_of_measure VARCHAR(20) NOT NULL,
    cost_impact_paise BIGINT NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    reported_by_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.10 COUPONS & REDEMPTIONS
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE',
    discount_value DOUBLE PRECISION DEFAULT 0.0,
    discount_value_paise BIGINT DEFAULT 0,
    discount_percentage NUMERIC(5, 2) DEFAULT 0.00,
    min_order_amount_paise BIGINT NOT NULL DEFAULT 0,
    min_order_value_paise BIGINT DEFAULT 0,
    max_discount_paise BIGINT,
    max_discount_amount_paise BIGINT,
    one_time_per_customer BOOLEAN DEFAULT TRUE,
    is_targeted BOOLEAN DEFAULT FALSE,
    total_usage_limit INT DEFAULT 1000,
    redemption_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_coupon_code UNIQUE (restaurant_id, code)
);

CREATE TABLE IF NOT EXISTS coupon_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES staff_members(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    max_redemptions INT DEFAULT 1,
    redemptions_used INT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT uq_coupon_customer_assignment UNIQUE (coupon_id, customer_id)
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_phone VARCHAR(50),
    discount_applied_paise BIGINT NOT NULL DEFAULT 0,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(100)
);

-- 3.11 RESERVATIONS & CUSTOMER FEEDBACK
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(50),
    customer_phone_e164 VARCHAR(20),
    reservation_date DATE,
    reservation_time TIMESTAMPTZ NOT NULL,
    party_size INT NOT NULL DEFAULT 2 CHECK (party_size > 0),
    guest_count INT NOT NULL DEFAULT 2 CHECK (guest_count > 0),
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'CONFIRMED', -- 'PENDING', 'CONFIRMED', 'SEATED', 'CANCELLED', 'NO_SHOW'
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.12 CLOUD-OFFLINE SYNC INFRASTRUCTURE & AUDIT
CREATE TABLE IF NOT EXISTS sync_outbox (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    retry_count INT NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending ON sync_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS sync_inbox (
    inbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_origin VARCHAR(50) NOT NULL DEFAULT 'SUPABASE_CLOUD',
    event_type VARCHAR(50) NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error_message TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending ON sync_inbox(status, received_at);

CREATE TABLE IF NOT EXISTS sync_checkpoints (
    id VARCHAR(50) PRIMARY KEY,
    last_synced_event_id UUID,
    last_synced_timestamp TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(20) NOT NULL DEFAULT 'IDLE',
    details JSONB
);

CREATE TABLE IF NOT EXISTS idempotency_records (
    idempotency_key VARCHAR(64) PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INT NOT NULL DEFAULT 200,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role VARCHAR(50) NOT NULL,
    actor_label VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    payload_before JSONB,
    payload_after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS across all tables
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_prints ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE wastage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Security context helper functions
CREATE OR REPLACE FUNCTION current_staff_restaurant_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id', '')::UUID,
    (SELECT restaurant_id FROM public.users WHERE id = auth.uid() LIMIT 1),
    '00000000-0000-0000-0000-000000000001'::UUID
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_customer_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'customer_id', '')::UUID,
    NULLIF(auth.uid()::text, '')::UUID
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION current_staff_role()
RETURNS VARCHAR AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    (SELECT role FROM public.users WHERE id = auth.uid() LIMIT 1),
    'STAFF'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 4.1 RESTAURANTS
DROP POLICY IF EXISTS "restaurants_public_read" ON restaurants;
CREATE POLICY "restaurants_public_read" ON restaurants
    FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "restaurants_staff_manage" ON restaurants;
CREATE POLICY "restaurants_staff_manage" ON restaurants
    FOR ALL TO authenticated
    USING (id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.2 USERS & STAFF
DROP POLICY IF EXISTS "users_admin_manage" ON public.users;
CREATE POLICY "users_admin_manage" ON public.users
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        current_staff_role() = 'ADMIN' OR
        id = auth.uid()
    );

DROP POLICY IF EXISTS "staff_tenant_read" ON staff_members;
CREATE POLICY "staff_tenant_read" ON staff_members
    FOR SELECT TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "staff_admin_manage" ON staff_members;
CREATE POLICY "staff_admin_manage" ON staff_members
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() IN ('ADMIN', 'MANAGER'))
    );

DROP POLICY IF EXISTS "attendance_staff_manage" ON staff_attendance;
CREATE POLICY "attendance_staff_manage" ON staff_attendance
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.3 CUSTOMERS & AUTH
DROP POLICY IF EXISTS "customers_staff_manage" ON customers;
CREATE POLICY "customers_staff_manage" ON customers
    FOR ALL USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customers_customer_select" ON customers;
CREATE POLICY "customers_customer_select" ON customers
    FOR SELECT USING (id = current_customer_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customers_customer_update" ON customers;
CREATE POLICY "customers_customer_update" ON customers
    FOR UPDATE USING (id = current_customer_id())
    WITH CHECK (id = current_customer_id());

DROP POLICY IF EXISTS "customers_anon_insert" ON customers;
CREATE POLICY "customers_anon_insert" ON customers
    FOR INSERT WITH CHECK (TRUE);

DROP POLICY IF EXISTS "auth_challenges_policy" ON customer_auth_challenges;
CREATE POLICY "auth_challenges_policy" ON customer_auth_challenges
    FOR ALL TO anon, authenticated
    USING (TRUE) WITH CHECK (TRUE);

-- 4.4 TABLES & QR ACCESS
DROP POLICY IF EXISTS "tables_public_read" ON tables;
CREATE POLICY "tables_public_read" ON tables
    FOR SELECT TO anon, authenticated
    USING (ordering_enabled = TRUE OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "tables_staff_manage" ON tables;
CREATE POLICY "tables_staff_manage" ON tables
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "table_transfers_manage" ON table_transfers;
CREATE POLICY "table_transfers_manage" ON table_transfers
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.5 MENU CATEGORIES & ITEMS (Customer QR View + Staff Manage)
DROP POLICY IF EXISTS "menu_categories_public_read" ON menu_categories;
CREATE POLICY "menu_categories_public_read" ON menu_categories
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_categories_staff_manage" ON menu_categories;
CREATE POLICY "menu_categories_staff_manage" ON menu_categories
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_items_public_read" ON menu_items;
CREATE POLICY "menu_items_public_read" ON menu_items
    FOR SELECT TO anon, authenticated
    USING (is_available = TRUE OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_items_staff_manage" ON menu_items;
CREATE POLICY "menu_items_staff_manage" ON menu_items
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.6 ORDERS & ORDER ITEMS (Customer QR Ordering + Staff Control)
DROP POLICY IF EXISTS "orders_public_insert" ON orders;
CREATE POLICY "orders_public_insert" ON orders
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "orders_public_select" ON orders;
CREATE POLICY "orders_public_select" ON orders
    FOR SELECT TO anon, authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "orders_staff_manage" ON orders;
CREATE POLICY "orders_staff_manage" ON orders
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "order_items_public_insert" ON order_items;
CREATE POLICY "order_items_public_insert" ON order_items
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "order_items_public_select" ON order_items;
CREATE POLICY "order_items_public_select" ON order_items
    FOR SELECT TO anon, authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "order_items_staff_manage" ON order_items;
CREATE POLICY "order_items_staff_manage" ON order_items
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.restaurant_id = current_staff_restaurant_id()
    ));

DROP POLICY IF EXISTS "timeline_events_manage" ON order_timeline_events;
CREATE POLICY "timeline_events_manage" ON order_timeline_events
    FOR ALL TO authenticated
    USING (auth.jwt() ->> 'role' = 'service_role' OR EXISTS (
        SELECT 1 FROM orders o WHERE o.id = order_timeline_events.order_id AND o.restaurant_id = current_staff_restaurant_id()
    ));

-- 4.7 BILLING, PAYMENTS & INVOICES
DROP POLICY IF EXISTS "split_bills_staff_manage" ON split_bills;
CREATE POLICY "split_bills_staff_manage" ON split_bills
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "split_bill_items_manage" ON split_bill_items;
CREATE POLICY "split_bill_items_manage" ON split_bill_items
    FOR ALL TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "payments_staff_manage" ON payments;
CREATE POLICY "payments_staff_manage" ON payments
    FOR ALL TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "invoices_staff_manage" ON invoices;
CREATE POLICY "invoices_staff_manage" ON invoices
    FOR ALL TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "invoice_prints_manage" ON invoice_prints;
CREATE POLICY "invoice_prints_manage" ON invoice_prints
    FOR ALL TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "refunds_admin_manage" ON refunds;
CREATE POLICY "refunds_admin_manage" ON refunds
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() IN ('ADMIN', 'MANAGER'))
    );

-- 4.8 INVENTORY & RECIPES
DROP POLICY IF EXISTS "inventory_staff_manage" ON inventory_items;
CREATE POLICY "inventory_staff_manage" ON inventory_items
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "recipes_staff_manage" ON recipes;
CREATE POLICY "recipes_staff_manage" ON recipes
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "recipe_ingredients_manage" ON recipe_ingredients;
CREATE POLICY "recipe_ingredients_manage" ON recipe_ingredients
    FOR ALL TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "stock_movements_staff_manage" ON stock_movements;
CREATE POLICY "stock_movements_staff_manage" ON stock_movements
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "wastage_staff_manage" ON wastage_records;
CREATE POLICY "wastage_staff_manage" ON wastage_records
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.9 COUPONS & REDEMPTIONS
DROP POLICY IF EXISTS "coupons_public_read" ON coupons;
CREATE POLICY "coupons_public_read" ON coupons
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupons_staff_manage" ON coupons;
CREATE POLICY "coupons_staff_manage" ON coupons
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_assignments_customer_read" ON coupon_assignments;
CREATE POLICY "coupon_assignments_customer_read" ON coupon_assignments
    FOR SELECT TO anon, authenticated
    USING (customer_id = current_customer_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_assignments_staff_manage" ON coupon_assignments;
CREATE POLICY "coupon_assignments_staff_manage" ON coupon_assignments
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_redemptions_manage" ON coupon_redemptions;
CREATE POLICY "coupon_redemptions_manage" ON coupon_redemptions
    FOR ALL TO authenticated, anon
    USING (TRUE);

-- 4.10 RESERVATIONS & FEEDBACK
DROP POLICY IF EXISTS "reservations_staff_manage" ON reservations;
CREATE POLICY "reservations_staff_manage" ON reservations
    FOR ALL TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customer_feedback_staff_manage" ON customer_feedback;
CREATE POLICY "customer_feedback_staff_manage" ON customer_feedback
    FOR ALL TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.11 SYNC ENGINE & AUDIT
DROP POLICY IF EXISTS "sync_outbox_policy" ON sync_outbox;
CREATE POLICY "sync_outbox_policy" ON sync_outbox
    FOR ALL TO authenticated, anon
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "sync_inbox_policy" ON sync_inbox;
CREATE POLICY "sync_inbox_policy" ON sync_inbox
    FOR ALL TO authenticated, anon
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "sync_checkpoints_policy" ON sync_checkpoints;
CREATE POLICY "sync_checkpoints_policy" ON sync_checkpoints
    FOR ALL TO authenticated, anon
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "idempotency_policy" ON idempotency_records;
CREATE POLICY "idempotency_policy" ON idempotency_records
    FOR ALL TO authenticated, anon
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "audit_logs_policy" ON audit_logs;
CREATE POLICY "audit_logs_policy" ON audit_logs
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- Grant permissions to standard Supabase client roles
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated, anon;

-- ------------------------------------------------------------------------------
-- 5. STORED PROCEDURES & TRIGGERS
-- ------------------------------------------------------------------------------

-- Automated Supabase auth.users synchronization to public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    default_rest_id UUID;
    user_role VARCHAR(50);
    user_perms JSONB;
BEGIN
    default_rest_id := COALESCE(
        (NEW.raw_user_meta_data->>'restaurant_id')::UUID,
        '00000000-0000-0000-0000-000000000001'::UUID
    );
    
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'CASHIER');
    
    IF user_role = 'ADMIN' THEN
        user_perms := '["*"]'::jsonb;
    ELSE
        user_perms := COALESCE(
            NEW.raw_user_meta_data->'permissions',
            '["pos:orders:create","pos:bills:settle","kitchen:kot:fire"]'::jsonb
        );
    END IF;

    INSERT INTO public.users (id, restaurant_id, email, name, role, permissions, is_active)
    VALUES (
        NEW.id,
        default_rest_id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        user_role,
        user_perms,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = COALESCE(EXCLUDED.name, public.users.name),
        role = COALESCE(EXCLUDED.role, public.users.role),
        permissions = COALESCE(EXCLUDED.permissions, public.users.permissions),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger hook on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT OR UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Concurrency-safe server-side coupon validation
CREATE OR REPLACE FUNCTION fn_validate_coupon_server_side(
    p_restaurant_id UUID,
    p_customer_id UUID,
    p_coupon_code VARCHAR,
    p_cart_subtotal_paise BIGINT
)
RETURNS TABLE (
    is_valid BOOLEAN,
    authorized_discount_paise BIGINT,
    coupon_id UUID,
    assignment_id UUID,
    rejection_reason TEXT
) AS $$
DECLARE
    v_coupon RECORD;
    v_assignment RECORD;
    v_calculated_discount BIGINT := 0;
BEGIN
    SELECT * INTO v_coupon
    FROM coupons
    WHERE restaurant_id = p_restaurant_id
      AND code = UPPER(TRIM(p_coupon_code))
      AND is_active = TRUE
    FOR SHARE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, NULL::UUID, NULL::UUID, 'Coupon not found or inactive'::TEXT;
        RETURN;
    END IF;

    IF NOW() < v_coupon.valid_from THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID, 'Promotion has not started yet'::TEXT;
        RETURN;
    END IF;

    IF NOW() > v_coupon.valid_until THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID, 'Promotion has expired'::TEXT;
        RETURN;
    END IF;

    IF p_cart_subtotal_paise < v_coupon.min_order_value_paise THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID,
            format('Minimum tray value of ₹%s required', (v_coupon.min_order_value_paise / 100)::TEXT)::TEXT;
        RETURN;
    END IF;

    IF v_coupon.redemption_count >= v_coupon.total_usage_limit THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID, 'Global redemption limit reached for this promotion'::TEXT;
        RETURN;
    END IF;

    IF v_coupon.is_targeted THEN
        IF p_customer_id IS NULL THEN
            RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID, 'This VIP privilege requires verified patron login'::TEXT;
            RETURN;
        END IF;

        SELECT * INTO v_assignment
        FROM coupon_assignments
        WHERE coupon_id = v_coupon.id
          AND customer_id = p_customer_id
          AND status = 'ACTIVE'
        FOR SHARE;

        IF NOT FOUND THEN
            RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID, 'This coupon is not assigned to your account'::TEXT;
            RETURN;
        END IF;

        IF v_assignment.redemptions_used >= v_assignment.max_redemptions THEN
            RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, v_assignment.id, 'You have already exhausted your redemptions for this privilege'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- Calculate discount in paise
    IF v_coupon.discount_type = 'FIXED' THEN
        v_calculated_discount := COALESCE(v_coupon.discount_value_paise, (v_coupon.discount_value * 100)::BIGINT);
    ELSIF v_coupon.discount_type = 'PERCENTAGE' THEN
        v_calculated_discount := ROUND((p_cart_subtotal_paise * COALESCE(v_coupon.discount_percentage, v_coupon.discount_value::NUMERIC)) / 100.0);
    END IF;

    -- Cap discount if max_discount_amount_paise is configured
    IF v_coupon.max_discount_amount_paise IS NOT NULL AND v_calculated_discount > v_coupon.max_discount_amount_paise THEN
        v_calculated_discount := v_coupon.max_discount_amount_paise;
    END IF;

    -- Cannot exceed subtotal
    IF v_calculated_discount > p_cart_subtotal_paise THEN
        v_calculated_discount := p_cart_subtotal_paise;
    END IF;

    RETURN QUERY SELECT TRUE, v_calculated_discount, v_coupon.id, v_assignment.id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 6. SYSTEM BOOTSTRAP SEED (Root Restaurant & Root Super Admin)
-- ------------------------------------------------------------------------------

-- Root Restaurant
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
    name = EXCLUDED.name,
    is_active = true;

-- Root Super Admin
INSERT INTO staff_members (
    id, restaurant_id, name, role, email, login_id, pin_hash, phone, phone_e164, is_active, shift, assigned_section, permissions
) VALUES (
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
    'Executive HQ',
    '["*"]'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    role = 'ADMIN',
    permissions = '["*"]'::jsonb,
    pin_hash = 'Admin@123',
    is_active = true;

-- ------------------------------------------------------------------------------
-- 7. PRODUCTION SECURITY: DEDICATED LEAST-PRIVILEGE APPLICATION ROLE (RECOMMENDED)
-- ------------------------------------------------------------------------------
-- In professional deployments, do NOT connect using the root 'postgres' superuser.
-- Uncomment and run the block below to create a dedicated app role with restricted privileges:
--
-- DO $$
-- BEGIN
--     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hotel_crm_app') THEN
--         CREATE ROLE hotel_crm_app WITH LOGIN PASSWORD 'ReplaceWithStrongSecureSecretPass123!';
--     END IF;
-- END $$;
--
-- GRANT USAGE ON SCHEMA public TO hotel_crm_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hotel_crm_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hotel_crm_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hotel_crm_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hotel_crm_app;
--
-- Then in your production server environment, your DATABASE_URL becomes:
-- postgresql://hotel_crm_app:ReplaceWithStrongSecureSecretPass123!@aws-0-[REGION].pooler.supabase.com:5432/postgres?sslmode=require

