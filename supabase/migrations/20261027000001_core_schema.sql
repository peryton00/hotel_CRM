-- ==============================================================================
-- 20261027000001_core_schema.sql
-- HOTEL_CRM Core Schema: Multi-Tenant Base, Catalog, Dining Tables, Orders
-- All monetary figures represented as exact integer paise (1 INR = 100 paise)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ENUMS
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
-- 2. RESTAURANTS (Tenant Root)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255),
    description TEXT,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    currency_symbol VARCHAR(5) NOT NULL DEFAULT '₹',
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    service_charge_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. STAFF MEMBERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    supabase_auth_id UUID UNIQUE, -- Linked to Supabase Auth auth.users.id if assigned
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'STAFF', -- 'ADMIN', 'MANAGER', 'CAPTAIN', 'CASHIER'
    pin_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone_e164 VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON staff_members(restaurant_id);

-- ------------------------------------------------------------------------------
-- 4. CUSTOMERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    status customer_status NOT NULL DEFAULT 'ACTIVE',
    loyalty_tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
    loyalty_points INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
    total_spend_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_spend_paise >= 0),
    visit_count INT NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_customer_phone UNIQUE (restaurant_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(restaurant_id, phone_e164);

-- ------------------------------------------------------------------------------
-- 5. TABLES & DINING ZONES
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL,
    capacity INT NOT NULL DEFAULT 4 CHECK (capacity > 0),
    section VARCHAR(50) NOT NULL DEFAULT 'Main Dining',
    qr_token VARCHAR(64) NOT NULL,
    status table_status NOT NULL DEFAULT 'AVAILABLE',
    ordering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_number UNIQUE (restaurant_id, number),
    CONSTRAINT uq_table_qr_token UNIQUE (qr_token)
);
CREATE INDEX IF NOT EXISTS idx_tables_restaurant ON tables(restaurant_id);

-- ------------------------------------------------------------------------------
-- 6. MENU CATALOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_category_slug UNIQUE (restaurant_id, slug)
);

CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
    dietary VARCHAR(20) NOT NULL DEFAULT 'VEG', -- 'VEG', 'NON_VEG', 'EGG', 'VEGAN'
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);

-- ------------------------------------------------------------------------------
-- 7. ORDERS & TIMELINE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(64) UNIQUE,
    order_type order_type NOT NULL DEFAULT 'DINE_IN',
    pickup_reference VARCHAR(50), -- e.g. 'TA-8821' for takeaway orders; NULL for dine-in
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL, -- NULL for Takeaway orders
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone_e164 VARCHAR(20) NOT NULL,
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
    applied_coupon_code VARCHAR(50),
    tax_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_paise >= 0),
    cgst_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (cgst_amount_paise >= 0),
    sgst_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (sgst_amount_paise >= 0),
    total_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_amount_paise >= 0),
    total_refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_refunded_paise >= 0),
    status order_status NOT NULL DEFAULT 'PENDING',
    payment_status payment_status NOT NULL DEFAULT 'UNPAID',
    payment_method VARCHAR(50), -- 'CASH', 'UPI', 'CARD', 'SPLIT'
    is_split BOOLEAN NOT NULL DEFAULT FALSE,
    split_count INT NOT NULL DEFAULT 1,
    settled_at TIMESTAMPTZ, -- Authoritative settlement timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_order_number UNIQUE (restaurant_id, order_number),
    CONSTRAINT chk_dinein_table CHECK (order_type = 'TAKEAWAY' OR table_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_created ON orders(restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_settled_at ON orders(restaurant_id, settled_at);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    item_name VARCHAR(150) NOT NULL,
    unit_price_paise BIGINT NOT NULL CHECK (unit_price_paise >= 0),
    quantity INT NOT NULL CHECK (quantity > 0),
    item_total_paise BIGINT NOT NULL CHECK (item_total_paise >= 0),
    special_instructions TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    note TEXT,
    staff_name VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_timeline_order ON order_timeline_events(order_id);

-- ------------------------------------------------------------------------------
-- 8. TABLE TRANSFERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS table_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    source_table_id UUID NOT NULL REFERENCES tables(id),
    destination_table_id UUID NOT NULL REFERENCES tables(id),
    staff_name VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 9. IDEMPOTENCY STORE
-- ------------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_records(expires_at);

-- ------------------------------------------------------------------------------
-- 10. AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    actor_id UUID,
    actor_role actor_role NOT NULL,
    actor_label VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    payload_before JSONB,
    payload_after JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_restaurant_entity ON audit_logs(restaurant_id, entity_type, entity_id);
