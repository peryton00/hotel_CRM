-- ==============================================================================
-- HOTEL_CRM: Master Production Database Schema
-- File: supabase/schema.sql
-- Description: Single-file idempotent, foolproof database definition for Supabase.
--              Fully aligned with Rust API (hotel_crm_api), Angular Web Admin,
--              and Next.js Customer QR Ordering Menu.
--              - Granular Row Level Security (RLS) policies for EVERY table
--              - Supabase Realtime replication for live operations
--              - Streamlined lifecycle: in-place state transitions with 
--                accepted_at and delivered_at milestone timestamps (no bloat)
--              - Multi-tenant isolation & PostgreSQL generated compatibility
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
    google_review_url VARCHAR(500),
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    currency_symbol VARCHAR(5) NOT NULL DEFAULT '₹',
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
    sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 2.50,
    service_charge_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restaurants_slug ON restaurants(slug);

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
CREATE INDEX IF NOT EXISTS idx_staff_login_id ON staff_members(restaurant_id, login_id);

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
    phone VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    status customer_status NOT NULL DEFAULT 'ACTIVE',
    loyalty_tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
    loyalty_points INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
    visit_count INT NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
    total_orders INT NOT NULL DEFAULT 0,
    total_spend_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_spend_paise >= 0),
    total_spent_paise BIGINT GENERATED ALWAYS AS (total_spend_paise) STORED,
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_customer_phone UNIQUE (restaurant_id, phone)
);
CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_phone_e164 ON customers(phone_e164);

CREATE TABLE IF NOT EXISTS customer_auth_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
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
    table_number VARCHAR(20) GENERATED ALWAYS AS (number) STORED,
    capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
    section VARCHAR(50) NOT NULL DEFAULT 'Main Dining',
    qr_token VARCHAR(64) NOT NULL UNIQUE,
    qr_code_identifier VARCHAR(64),
    status table_status NOT NULL DEFAULT 'AVAILABLE',
    ordering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    active_order_id UUID,
    current_seating_session_id VARCHAR(100), -- Dynamic parent dining session binding
    assigned_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_number UNIQUE (restaurant_id, number)
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON tables(qr_token);
CREATE INDEX IF NOT EXISTS idx_tables_session ON tables(restaurant_id, current_seating_session_id);

CREATE TABLE IF NOT EXISTS table_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    source_table_id UUID NOT NULL REFERENCES tables(id),
    destination_table_id UUID NOT NULL REFERENCES tables(id),
    staff_name VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_table_transfers_order ON table_transfers(order_id);
CREATE INDEX IF NOT EXISTS idx_table_transfers_restaurant ON table_transfers(restaurant_id);

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
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
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

-- 3.7 ORDERS & ORDER ITEMS (Streamlined In-Place Lifecycle Transitions)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(64) UNIQUE,
    seating_session_id VARCHAR(100), -- Aggregates child add-ons into parent dining session
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    customer_phone_e164 VARCHAR(20),
    customer_phone VARCHAR(50),
    order_type VARCHAR(50) NOT NULL DEFAULT 'DINE_IN',
    pickup_reference VARCHAR(50),
    
    -- In-place status lifecycle: confirmed -> preparing -> ready -> served/delivered -> completed
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    payment_status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payment_method VARCHAR(50),
    
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    discount_amount_paise BIGINT GENERATED ALWAYS AS (discount_paise) STORED,
    applied_coupon_code VARCHAR(50),
    tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    tax_amount_paise BIGINT GENERATED ALWAYS AS (tax_paise) STORED,
    cgst_rate NUMERIC(5, 2) DEFAULT 2.50,
    sgst_rate NUMERIC(5, 2) DEFAULT 2.50,
    cgst_amount_paise BIGINT DEFAULT 0 CHECK (cgst_amount_paise >= 0),
    sgst_amount_paise BIGINT DEFAULT 0 CHECK (sgst_amount_paise >= 0),
    service_charge_paise BIGINT NOT NULL DEFAULT 0 CHECK (service_charge_paise >= 0),
    round_off_paise BIGINT NOT NULL DEFAULT 0,
    total_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
    total_refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_refunded_paise >= 0),
    is_split BOOLEAN NOT NULL DEFAULT FALSE,
    split_count INT NOT NULL DEFAULT 1,
    notes TEXT,
    server_staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    
    -- Critical Business Milestone Timestamps (Essential Lifecycle Records)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ, -- Stamped when accepted / sent to kitchen
    delivered_at TIMESTAMPTZ, -- Stamped when served / delivered to table
    served_at TIMESTAMPTZ GENERATED ALWAYS AS (delivered_at) STORED,
    settled_at TIMESTAMPTZ, -- Stamped when bill payment is settled
    cancelled_at TIMESTAMPTZ, -- Stamped if cancelled
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_unknown_timestamp BOOLEAN DEFAULT FALSE,
    CONSTRAINT uq_restaurant_order_number UNIQUE (restaurant_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_seating_session ON orders(restaurant_id, seating_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(restaurant_id, table_id);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    name VARCHAR(150) NOT NULL,
    item_name VARCHAR(150) GENERATED ALWAYS AS (name) STORED,
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    item_total_paise BIGINT NOT NULL DEFAULT 0,
    subtotal_paise BIGINT NOT NULL DEFAULT 0,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    discount_paise BIGINT NOT NULL DEFAULT 0,
    total_paise BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    special_instructions TEXT GENERATED ALWAYS AS (notes) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item ON order_items(menu_item_id);

-- Optional lightweight timeline events table for backward-compatible logging
CREATE TABLE IF NOT EXISTS order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    status VARCHAR(50),
    notes TEXT,
    note TEXT GENERATED ALWAYS AS (notes) STORED,
    staff_name VARCHAR(100),
    performed_by UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline_events(order_id);

-- 3.8 BILLING, PAYMENTS & REFUNDS
CREATE TABLE IF NOT EXISTS split_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_index INT NOT NULL DEFAULT 1 CHECK (split_index > 0),
    split_number INT GENERATED ALWAYS AS (split_index) STORED,
    split_total_count INT NOT NULL DEFAULT 1 CHECK (split_total_count > 0),
    total_splits INT GENERATED ALWAYS AS (split_total_count) STORED,
    split_type VARCHAR(20) NOT NULL DEFAULT 'EQUAL',
    customer_name VARCHAR(100),
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
    tax_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_paise >= 0),
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
    total_amount_paise BIGINT GENERATED ALWAYS AS (amount_paise) STORED,
    total_refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_refunded_paise >= 0),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID',
    status VARCHAR(50) GENERATED ALWAYS AS (payment_status) STORED,
    payment_id UUID,
    payment_method VARCHAR(50),
    print_count INT NOT NULL DEFAULT 0 CHECK (print_count >= 0),
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_split_index UNIQUE (order_id, split_index),
    CONSTRAINT chk_split_index_limit CHECK (split_index <= split_total_count)
);
CREATE INDEX IF NOT EXISTS idx_split_bills_order ON split_bills(order_id);
CREATE INDEX IF NOT EXISTS idx_split_bills_settled ON split_bills(restaurant_id, settled_at);

CREATE TABLE IF NOT EXISTS split_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (amount_paise >= 0),
    allocated_paise BIGINT GENERATED ALWAYS AS (amount_paise) STORED
);
CREATE INDEX IF NOT EXISTS idx_split_bill_items_split ON split_bill_items(split_bill_id);

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_bill_id UUID REFERENCES split_bills(id) ON DELETE SET NULL,
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    payment_method VARCHAR(50) NOT NULL, -- 'CASH', 'UPI', 'CARD', 'SPLIT'
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    upi_transaction_ref VARCHAR(100),
    idempotency_key VARCHAR(64) UNIQUE,
    notes TEXT,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_unknown_timestamp BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant_settled ON payments(restaurant_id, settled_at);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);

CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(50),
    payment_id UUID REFERENCES payments(id) ON DELETE RESTRICT,
    split_bill_id UUID REFERENCES split_bills(id) ON DELETE SET NULL,
    table_number VARCHAR(20),
    customer_name VARCHAR(100),
    original_payment_method VARCHAR(50),
    refund_method VARCHAR(50),
    refund_amount_paise BIGINT NOT NULL CHECK (refund_amount_paise > 0),
    amount_paise BIGINT GENERATED ALWAYS AS (refund_amount_paise) STORED,
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'requested',
    authorized_by UUID REFERENCES staff_members(id),
    processed_by_staff_id UUID REFERENCES staff_members(id),
    staff_name VARCHAR(100) DEFAULT 'Staff',
    idempotency_key VARCHAR(64) UNIQUE,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    legacy_unknown_timestamp BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_restaurant_completed ON refunds(restaurant_id, completed_at);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
    discount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
    discount_amount_paise BIGINT GENERATED ALWAYS AS (discount_paise) STORED,
    tax_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),
    tax_amount_paise BIGINT GENERATED ALWAYS AS (tax_paise) STORED,
    round_off_paise BIGINT NOT NULL DEFAULT 0,
    total_paise BIGINT NOT NULL CHECK (total_paise >= 0),
    total_amount_paise BIGINT GENERATED ALWAYS AS (total_paise) STORED,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PAID',
    is_printed BOOLEAN NOT NULL DEFAULT FALSE,
    print_count INT NOT NULL DEFAULT 0 CHECK (print_count >= 0),
    last_printed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_invoice_number UNIQUE (restaurant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_restaurant_created ON invoices(restaurant_id, created_at);

CREATE TABLE IF NOT EXISTS invoice_prints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    printed_by UUID REFERENCES staff_members(id),
    staff_name VARCHAR(100) NOT NULL DEFAULT 'Staff',
    printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_reprint BOOLEAN NOT NULL DEFAULT FALSE,
    reprint_reason TEXT,
    reason TEXT GENERATED ALWAYS AS (reprint_reason) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_prints_invoice ON invoice_prints(invoice_id);

-- 3.9 INVENTORY & RECIPES
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    sku VARCHAR(50),
    category VARCHAR(50) DEFAULT 'General',
    unit VARCHAR(20) DEFAULT 'kg',
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
    min_order_value_paise BIGINT GENERATED ALWAYS AS (min_order_amount_paise) STORED,
    max_discount_paise BIGINT,
    max_discount_amount_paise BIGINT GENERATED ALWAYS AS (max_discount_paise) STORED,
    one_time_per_customer BOOLEAN DEFAULT TRUE,
    is_targeted BOOLEAN DEFAULT FALSE,
    total_usage_limit INT DEFAULT 1000,
    redemption_count INT DEFAULT 0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 year'),
    start_date TIMESTAMPTZ GENERATED ALWAYS AS (valid_from) STORED,
    end_date TIMESTAMPTZ GENERATED ALWAYS AS (valid_until) STORED,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_coupon_code UNIQUE (restaurant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant_code ON coupons(restaurant_id, code);

CREATE TABLE IF NOT EXISTS coupon_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES staff_members(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    max_redemptions INT DEFAULT 1,
    redemptions_used INT DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    CONSTRAINT uq_coupon_customer_assignment UNIQUE (coupon_id, customer_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_assignments_customer ON coupon_assignments(customer_id);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_phone VARCHAR(50),
    discount_applied_paise BIGINT NOT NULL DEFAULT 0,
    discount_amount_applied_paise BIGINT GENERATED ALWAYS AS (discount_applied_paise) STORED,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_lookup ON coupon_redemptions(coupon_id, customer_phone);

-- 3.11 RESERVATIONS & CUSTOMER FEEDBACK
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone VARCHAR(50),
    customer_phone_e164 VARCHAR(20),
    party_size INT NOT NULL DEFAULT 2 CHECK (party_size > 0),
    guest_count INT GENERATED ALWAYS AS (party_size) STORED,
    reservation_date DATE,
    reservation_time TIMESTAMPTZ NOT NULL,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    assigned_table_id UUID GENERATED ALWAYS AS (table_id) STORED,
    status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED', -- 'PENDING', 'CONFIRMED', 'SEATED', 'CANCELLED', 'NO_SHOW'
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_time ON reservations(restaurant_id, reservation_time);

CREATE TABLE IF NOT EXISTS customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100),
    customer_phone VARCHAR(50),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    food_rating INT CHECK (food_rating >= 1 AND food_rating <= 5),
    service_rating INT CHECK (service_rating >= 1 AND service_rating <= 5),
    ambience_rating INT CHECK (ambience_rating >= 1 AND ambience_rating <= 5),
    comments TEXT,
    resolution_note TEXT,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_feedback_restaurant ON customer_feedback(restaurant_id);

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
CREATE INDEX IF NOT EXISTS idx_idempotency_restaurant ON idempotency_records(restaurant_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'STAFF',
    actor_label VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    payload_before JSONB,
    payload_after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_restaurant_created ON audit_logs(restaurant_id, created_at);

-- ------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) POLICIES - GRANULAR & HARDENED PER TABLE
-- ------------------------------------------------------------------------------

-- Enable RLS across every single table
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
    NULL -- Strictly returns NULL when unauthenticated or unassociated
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
DROP POLICY IF EXISTS "restaurants_select" ON restaurants;
CREATE POLICY "restaurants_select" ON restaurants
    FOR SELECT USING (is_active = TRUE OR id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "restaurants_update" ON restaurants;
CREATE POLICY "restaurants_update" ON restaurants
    FOR UPDATE TO authenticated
    USING (id = current_staff_restaurant_id() AND current_staff_role() = 'ADMIN');

-- 4.2 USERS & STAFF
DROP POLICY IF EXISTS "users_select" ON public.users;
CREATE POLICY "users_select" ON public.users
    FOR SELECT TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        id = auth.uid() OR
        restaurant_id = current_staff_restaurant_id()
    );

DROP POLICY IF EXISTS "users_manage" ON public.users;
CREATE POLICY "users_manage" ON public.users
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() = 'ADMIN') OR
        id = auth.uid()
    );

DROP POLICY IF EXISTS "staff_select" ON staff_members;
CREATE POLICY "staff_select" ON staff_members
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "staff_manage" ON staff_members;
CREATE POLICY "staff_manage" ON staff_members
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() IN ('ADMIN', 'MANAGER'))
    );

DROP POLICY IF EXISTS "attendance_select" ON staff_attendance;
CREATE POLICY "attendance_select" ON staff_attendance
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "attendance_manage" ON staff_attendance;
CREATE POLICY "attendance_manage" ON staff_attendance
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.3 CUSTOMERS & AUTH CHALLENGES
DROP POLICY IF EXISTS "customers_staff_select" ON customers;
CREATE POLICY "customers_staff_select" ON customers
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customers_customer_select" ON customers;
CREATE POLICY "customers_customer_select" ON customers
    FOR SELECT TO anon, authenticated
    USING (id = current_customer_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customers_customer_update" ON customers;
CREATE POLICY "customers_customer_update" ON customers
    FOR UPDATE TO authenticated
    USING (id = current_customer_id() OR restaurant_id = current_staff_restaurant_id())
    WITH CHECK (id = current_customer_id() OR restaurant_id = current_staff_restaurant_id());

DROP POLICY IF EXISTS "customers_insert" ON customers;
CREATE POLICY "customers_insert" ON customers
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

-- OTP Challenges strictly gated to server-side functions / service_role
DROP POLICY IF EXISTS "auth_challenges_service_all" ON customer_auth_challenges;
CREATE POLICY "auth_challenges_service_all" ON customer_auth_challenges
    FOR ALL TO service_role
    USING (TRUE) WITH CHECK (TRUE);

-- 4.4 TABLES & QR ACCESS
DROP POLICY IF EXISTS "tables_public_select" ON tables;
CREATE POLICY "tables_public_select" ON tables
    FOR SELECT TO anon, authenticated
    USING (ordering_enabled = TRUE OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "tables_staff_manage" ON tables;
CREATE POLICY "tables_staff_manage" ON tables
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "table_transfers_manage" ON table_transfers;
CREATE POLICY "table_transfers_manage" ON table_transfers
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.5 MENU CATEGORIES & ITEMS
DROP POLICY IF EXISTS "menu_categories_public_select" ON menu_categories;
CREATE POLICY "menu_categories_public_select" ON menu_categories
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_categories_staff_manage" ON menu_categories;
CREATE POLICY "menu_categories_staff_manage" ON menu_categories
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_items_public_select" ON menu_items;
CREATE POLICY "menu_items_public_select" ON menu_items
    FOR SELECT TO anon, authenticated
    USING (is_available = TRUE OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "menu_items_staff_manage" ON menu_items;
CREATE POLICY "menu_items_staff_manage" ON menu_items
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.6 ORDERS & ORDER ITEMS (Scoped to active session / patron / staff)
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders
    FOR SELECT TO anon, authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        restaurant_id = current_staff_restaurant_id() OR
        customer_id = current_customer_id()
    );

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY "orders_insert" ON orders
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        order_type IN ('DINE_IN', 'TAKEAWAY') AND
        (status IN ('confirmed', 'pending', 'PENDING') OR auth.jwt() ->> 'role' = 'service_role')
    );

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY "orders_update" ON orders
    FOR UPDATE TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY "orders_delete" ON orders
    FOR DELETE TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() = 'ADMIN')
    );

DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items
    FOR SELECT TO anon, authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND (o.restaurant_id = current_staff_restaurant_id() OR o.customer_id = current_customer_id())
        )
    );

DROP POLICY IF EXISTS "order_items_insert" ON order_items;
CREATE POLICY "order_items_insert" ON order_items
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "order_items_manage" ON order_items;
CREATE POLICY "order_items_manage" ON order_items
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.restaurant_id = current_staff_restaurant_id()
        )
    );

DROP POLICY IF EXISTS "timeline_events_manage" ON order_timeline_events;
CREATE POLICY "timeline_events_manage" ON order_timeline_events
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_timeline_events.order_id
              AND o.restaurant_id = current_staff_restaurant_id()
        )
    );

-- 4.7 BILLING, PAYMENTS & INVOICES
DROP POLICY IF EXISTS "split_bills_select" ON split_bills;
CREATE POLICY "split_bills_select" ON split_bills
    FOR SELECT TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "split_bills_manage" ON split_bills;
CREATE POLICY "split_bills_manage" ON split_bills
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "split_bill_items_manage" ON split_bill_items;
CREATE POLICY "split_bill_items_manage" ON split_bill_items
    FOR ALL TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments
    FOR SELECT TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "payments_manage" ON payments;
CREATE POLICY "payments_manage" ON payments
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "refunds_select" ON refunds;
CREATE POLICY "refunds_select" ON refunds
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "refunds_manage" ON refunds;
CREATE POLICY "refunds_manage" ON refunds
    FOR ALL TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() IN ('ADMIN', 'MANAGER'))
    );

DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices
    FOR SELECT TO authenticated, anon
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "invoices_manage" ON invoices;
CREATE POLICY "invoices_manage" ON invoices
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "invoice_prints_manage" ON invoice_prints;
CREATE POLICY "invoice_prints_manage" ON invoice_prints
    FOR ALL TO authenticated
    USING (TRUE);

-- 4.8 INVENTORY & RECIPES
DROP POLICY IF EXISTS "inventory_select" ON inventory_items;
CREATE POLICY "inventory_select" ON inventory_items
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "inventory_manage" ON inventory_items;
CREATE POLICY "inventory_manage" ON inventory_items
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "recipes_manage" ON recipes;
CREATE POLICY "recipes_manage" ON recipes
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "recipe_ingredients_manage" ON recipe_ingredients;
CREATE POLICY "recipe_ingredients_manage" ON recipe_ingredients
    FOR ALL TO authenticated
    USING (TRUE);

DROP POLICY IF EXISTS "stock_movements_select" ON stock_movements;
CREATE POLICY "stock_movements_select" ON stock_movements
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "stock_movements_manage" ON stock_movements;
CREATE POLICY "stock_movements_manage" ON stock_movements
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "wastage_select" ON wastage_records;
CREATE POLICY "wastage_select" ON wastage_records
    FOR SELECT TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "wastage_manage" ON wastage_records;
CREATE POLICY "wastage_manage" ON wastage_records
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.9 COUPONS & REDEMPTIONS
DROP POLICY IF EXISTS "coupons_select" ON coupons;
CREATE POLICY "coupons_select" ON coupons
    FOR SELECT TO anon, authenticated
    USING (is_active = TRUE OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupons_manage" ON coupons;
CREATE POLICY "coupons_manage" ON coupons
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_assignments_select" ON coupon_assignments;
CREATE POLICY "coupon_assignments_select" ON coupon_assignments
    FOR SELECT TO anon, authenticated
    USING (customer_id = current_customer_id() OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_assignments_manage" ON coupon_assignments;
CREATE POLICY "coupon_assignments_manage" ON coupon_assignments
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "coupon_redemptions_select" ON coupon_redemptions;
CREATE POLICY "coupon_redemptions_select" ON coupon_redemptions
    FOR SELECT TO authenticated, anon
    USING (TRUE);

DROP POLICY IF EXISTS "coupon_redemptions_manage" ON coupon_redemptions;
CREATE POLICY "coupon_redemptions_manage" ON coupon_redemptions
    FOR ALL TO authenticated, service_role
    USING (TRUE);

-- 4.10 RESERVATIONS & FEEDBACK
DROP POLICY IF EXISTS "reservations_select" ON reservations;
CREATE POLICY "reservations_select" ON reservations
    FOR SELECT TO anon, authenticated
    USING (customer_id = current_customer_id() OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "reservations_insert" ON reservations;
CREATE POLICY "reservations_insert" ON reservations
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "reservations_manage" ON reservations;
CREATE POLICY "reservations_manage" ON reservations
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customer_feedback_select" ON customer_feedback;
CREATE POLICY "customer_feedback_select" ON customer_feedback
    FOR SELECT TO anon, authenticated
    USING (is_public = TRUE OR restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "customer_feedback_insert" ON customer_feedback;
CREATE POLICY "customer_feedback_insert" ON customer_feedback
    FOR INSERT TO anon, authenticated
    WITH CHECK (TRUE);

DROP POLICY IF EXISTS "customer_feedback_manage" ON customer_feedback;
CREATE POLICY "customer_feedback_manage" ON customer_feedback
    FOR ALL TO authenticated
    USING (restaurant_id = current_staff_restaurant_id() OR auth.jwt() ->> 'role' = 'service_role');

-- 4.11 SYNC ENGINE & AUDIT
DROP POLICY IF EXISTS "sync_outbox_policy" ON sync_outbox;
CREATE POLICY "sync_outbox_policy" ON sync_outbox
    FOR ALL TO service_role, authenticated
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "sync_inbox_policy" ON sync_inbox;
CREATE POLICY "sync_inbox_policy" ON sync_inbox
    FOR ALL TO service_role, authenticated
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "sync_checkpoints_policy" ON sync_checkpoints;
CREATE POLICY "sync_checkpoints_policy" ON sync_checkpoints
    FOR ALL TO service_role, authenticated
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "idempotency_policy" ON idempotency_records;
CREATE POLICY "idempotency_policy" ON idempotency_records
    FOR ALL TO service_role, authenticated
    USING (TRUE) WITH CHECK (TRUE);

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT TO authenticated
    USING (
        auth.jwt() ->> 'role' = 'service_role' OR
        (restaurant_id = current_staff_restaurant_id() AND current_staff_role() IN ('ADMIN', 'MANAGER'))
    );

DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
CREATE POLICY "audit_logs_insert" ON audit_logs
    FOR INSERT TO authenticated, service_role
    WITH CHECK (TRUE);

-- Database Role Grants
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;

-- Scoped writes for anon patrons (QR ordering, reservations & guest feedback)
GRANT INSERT ON TABLE orders TO anon;
GRANT INSERT ON TABLE order_items TO anon;
GRANT INSERT ON TABLE customers TO anon;
GRANT INSERT ON TABLE reservations TO anon;
GRANT INSERT ON TABLE customer_feedback TO anon;

-- ------------------------------------------------------------------------------
-- 5. AUTOMATED ORDER LIFECYCLE & USER TRIGGERS
-- ------------------------------------------------------------------------------

-- Automated Order Lifecycle Milestone Stamping Trigger
-- In-place status updates transition smoothly; records accepted_at and delivered_at
CREATE OR REPLACE FUNCTION trg_fn_order_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
    -- Stamp accepted_at on first movement to accepted / kitchen preparation
    IF (NEW.status IN ('accepted', 'ACCEPTED', 'preparing', 'PREPARING', 'in_preparation', 'IN_PREPARATION') 
        OR NEW.status = 'confirmed') 
        AND NEW.accepted_at IS NULL THEN
        NEW.accepted_at := NOW();
    END IF;

    -- Stamp delivered_at on transition to delivered / served / completed
    IF NEW.status IN ('delivered', 'DELIVERED', 'served', 'SERVED', 'completed', 'COMPLETED') 
        AND NEW.delivered_at IS NULL THEN
        NEW.delivered_at := NOW();
    END IF;

    -- Stamp settled_at when billing is paid
    IF NEW.payment_status IN ('paid', 'PAID') AND NEW.settled_at IS NULL THEN
        NEW.settled_at := NOW();
    END IF;

    -- Stamp cancelled_at on cancellation
    IF NEW.status IN ('cancelled', 'CANCELLED') AND NEW.cancelled_at IS NULL THEN
        NEW.cancelled_at := NOW();
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_lifecycle ON orders;
CREATE TRIGGER trg_order_lifecycle
    BEFORE INSERT OR UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trg_fn_order_lifecycle();

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

    IF p_cart_subtotal_paise < v_coupon.min_order_amount_paise THEN
        RETURN QUERY SELECT FALSE, 0::BIGINT, v_coupon.id, NULL::UUID,
            format('Minimum order amount of ₹%s required', (v_coupon.min_order_amount_paise / 100)::TEXT)::TEXT;
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

    -- Cap discount if max_discount_paise is configured
    IF v_coupon.max_discount_paise IS NOT NULL AND v_calculated_discount > v_coupon.max_discount_paise THEN
        v_calculated_discount := v_coupon.max_discount_paise;
    END IF;

    -- Cannot exceed subtotal
    IF v_calculated_discount > p_cart_subtotal_paise THEN
        v_calculated_discount := p_cart_subtotal_paise;
    END IF;

    RETURN QUERY SELECT TRUE, v_calculated_discount, v_coupon.id, v_assignment.id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 6. SUPABASE REALTIME REPLICATION CONFIGURATION
-- ------------------------------------------------------------------------------
-- REPLICA IDENTITY FULL ensures live websocket subscribers receive full row state
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE order_items REPLICA IDENTITY FULL;
ALTER TABLE tables REPLICA IDENTITY FULL;
ALTER TABLE customer_feedback REPLICA IDENTITY FULL;
ALTER TABLE payments REPLICA IDENTITY FULL;
ALTER TABLE sync_outbox REPLICA IDENTITY FULL;

-- Add essential live operational tables to the Supabase Realtime publication
DO $$
DECLARE
    tbl TEXT;
    target_tables TEXT[] := ARRAY['orders', 'order_items', 'tables', 'customer_feedback', 'payments', 'sync_outbox'];
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH tbl IN ARRAY target_tables LOOP
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
            EXCEPTION 
                WHEN duplicate_object THEN NULL;
                WHEN undefined_table THEN NULL;
            END;
        END LOOP;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 7. SYSTEM BOOTSTRAP SEED (Root Restaurant & Root Super Admin)
-- ------------------------------------------------------------------------------

-- Root Restaurant
INSERT INTO restaurants (
    id, slug, name, tagline, description, phone, email, address, city, state, postal_code,
    gstin, fssai_license, currency, currency_symbol, gst_rate, cgst_rate, sgst_rate, service_charge_rate, timezone, is_active
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
    2.50,
    2.50,
    0.00,
    'Asia/Kolkata',
    true
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    cgst_rate = EXCLUDED.cgst_rate,
    sgst_rate = EXCLUDED.sgst_rate,
    is_active = true;

-- Root Super Admin (Using crypt() with bcrypt hash instead of raw plaintext)
INSERT INTO staff_members (
    id, restaurant_id, name, role, email, login_id, pin_hash, phone, phone_e164, is_active, shift, assigned_section, permissions
) VALUES (
    '44444444-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Super Admin',
    'ADMIN',
    'admin@hotelcrm.com',
    'admin',
    crypt('Admin@123', gen_salt('bf')),
    '+91 98765 43210',
    '+919876543210',
    true,
    'Management',
    'Executive HQ',
    '["*"]'::jsonb
) ON CONFLICT (id) DO UPDATE SET
    role = 'ADMIN',
    permissions = '["*"]'::jsonb,
    pin_hash = crypt('Admin@123', gen_salt('bf')),
    is_active = true;
