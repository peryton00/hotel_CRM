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
    currency_symbol VARCHAR(5) NOT NULL DEFAULT 'â‚¹',
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
    login_id VARCHAR(100),
    phone VARCHAR(50),
    phone_e164 VARCHAR(20) NOT NULL,
    shift VARCHAR(100) DEFAULT 'General Shift',
    assigned_section VARCHAR(100) DEFAULT 'Main Dining Floor',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_staff_restaurant ON staff_members(restaurant_id);

-- ------------------------------------------------------------------------------
-- 4. CUSTOMERS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    phone_e164 VARCHAR(20),
    phone VARCHAR(50),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    total_orders INT DEFAULT 0,
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    status customer_status NOT NULL DEFAULT 'ACTIVE',
    loyalty_tier loyalty_tier NOT NULL DEFAULT 'BRONZE',
    loyalty_points INT NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
    total_spend_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_spend_paise >= 0),
    visit_count INT NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
-- ==============================================================================
-- 20261027000002_billing_and_payments.sql
-- HOTEL_CRM Billing, Split Bills, Payments, and Authoritative Refund Lifecycle
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. SPLIT BILLS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS split_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_index INT NOT NULL CHECK (split_index > 0),
    split_total_count INT NOT NULL CHECK (split_total_count > 0),
    split_type VARCHAR(20) NOT NULL DEFAULT 'EQUAL', -- 'EQUAL', 'ITEM'
    customer_name VARCHAR(100),
    subtotal_paise BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_paise >= 0),
    discount_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
    tax_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_paise >= 0),
    total_amount_paise BIGINT NOT NULL CHECK (total_amount_paise >= 0),
    total_refunded_paise BIGINT NOT NULL DEFAULT 0 CHECK (total_refunded_paise >= 0),
    payment_status payment_status NOT NULL DEFAULT 'UNPAID',
    payment_method VARCHAR(50),
    print_count INT NOT NULL DEFAULT 0 CHECK (print_count >= 0),
    settled_at TIMESTAMPTZ, -- Authoritative settlement timestamp for this split share
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_split_index UNIQUE (order_id, split_index),
    CONSTRAINT chk_split_index_limit CHECK (split_index <= split_total_count)
);
CREATE INDEX IF NOT EXISTS idx_split_bills_order ON split_bills(order_id);
CREATE INDEX IF NOT EXISTS idx_split_bills_settled_at ON split_bills(restaurant_id, settled_at);

CREATE TABLE IF NOT EXISTS split_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_bill_id UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0),
    amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0)
);
CREATE INDEX IF NOT EXISTS idx_split_bill_items_split ON split_bill_items(split_bill_id);

-- ------------------------------------------------------------------------------
-- 2. PAYMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    split_bill_id UUID REFERENCES split_bills(id) ON DELETE SET NULL,
    payment_method VARCHAR(50) NOT NULL, -- 'CASH', 'UPI', 'CARD'
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    idempotency_key VARCHAR(64) UNIQUE,
    settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_restaurant_settled ON payments(restaurant_id, settled_at);

-- ------------------------------------------------------------------------------
-- 3. REFUNDS (Authoritative Lifecycle & Completion Semantics from Phase 7D)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    split_bill_id UUID REFERENCES split_bills(id) ON DELETE SET NULL,
    table_number VARCHAR(20),
    customer_name VARCHAR(100) NOT NULL,
    original_payment_method VARCHAR(50),
    refund_amount_paise BIGINT NOT NULL CHECK (refund_amount_paise > 0),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED', -- 'PENDING', 'COMPLETED', 'CANCELLED'
    staff_name VARCHAR(100) NOT NULL DEFAULT 'Staff',
    idempotency_key VARCHAR(64) UNIQUE,
    completed_at TIMESTAMPTZ, -- Authoritative fund outflow timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_refund_completion_timestamp CHECK (status != 'COMPLETED' OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_restaurant_completed ON refunds(restaurant_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(restaurant_id, status);

-- ------------------------------------------------------------------------------
-- 4. INVOICES & PRINT LOG
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50) NOT NULL,
    subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
    discount_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount_paise >= 0),
    tax_amount_paise BIGINT NOT NULL DEFAULT 0 CHECK (tax_amount_paise >= 0),
    total_amount_paise BIGINT NOT NULL CHECK (total_amount_paise >= 0),
    payment_status payment_status NOT NULL DEFAULT 'UNPAID',
    is_printed BOOLEAN NOT NULL DEFAULT FALSE,
    last_printed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_invoice_number UNIQUE (restaurant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

CREATE TABLE IF NOT EXISTS invoice_prints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    is_reprint BOOLEAN NOT NULL DEFAULT FALSE,
    staff_name VARCHAR(100) NOT NULL,
    printed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_prints ON invoice_prints(invoice_id);
-- ==============================================================================
-- 20261027000003_inventory_and_recipes.sql
-- HOTEL_CRM Inventory, Recipe Management, Auditable Stock Ledger, and Wastage
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INVENTORY ITEMS & AVAILABLE-TO-PROMISE (ATP)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'General',
    unit VARCHAR(20) NOT NULL, -- 'KG', 'G', 'L', 'ML', 'PCS', 'PORTION'
    current_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (current_stock >= 0),
    reserved_stock NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (reserved_stock >= 0),
    min_threshold NUMERIC(12, 4) NOT NULL DEFAULT 0.0000 CHECK (min_threshold >= 0),
    unit_cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost_paise >= 0),
    supplier_name VARCHAR(150),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_inventory_item_name UNIQUE (restaurant_id, name),
    CONSTRAINT chk_reserved_not_exceed_stock CHECK (reserved_stock <= current_stock)
);
CREATE INDEX IF NOT EXISTS idx_inventory_items_restaurant ON inventory_items(restaurant_id);

-- ------------------------------------------------------------------------------
-- 2. RECIPES & INGREDIENT COSTING
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    yield_portions INT NOT NULL DEFAULT 1 CHECK (yield_portions > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_recipe_menu_item UNIQUE (restaurant_id, menu_item_id)
);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item ON recipes(menu_item_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20) NOT NULL,
    CONSTRAINT uq_recipe_ingredient UNIQUE (recipe_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

-- ------------------------------------------------------------------------------
-- 3. AUDITABLE STOCK MOVEMENTS LEDGER
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    movement_type VARCHAR(50) NOT NULL, -- 'PURCHASE', 'SALE_FULFILLMENT', 'WASTAGE', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE'
    quantity_change NUMERIC(12, 4) NOT NULL,
    previous_stock NUMERIC(12, 4) DEFAULT 0.0000,
    new_stock NUMERIC(12, 4) DEFAULT 0.0000,
    balance_after NUMERIC(12, 4) DEFAULT 0.0000,
    unit_cost_paise BIGINT NOT NULL DEFAULT 0,
    total_cost_paise BIGINT NOT NULL DEFAULT 0,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reference_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reference_wastage_id UUID,
    idempotency_key VARCHAR(100),
    reason TEXT,
    notes TEXT,
    performed_by VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant_time ON stock_movements(restaurant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id);

-- ------------------------------------------------------------------------------
-- 4. INVENTORY WASTAGE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wastage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    quantity NUMERIC(12, 4) NOT NULL CHECK (quantity > 0),
    unit VARCHAR(20),
    unit_of_measure VARCHAR(20),
    unit_cost_paise BIGINT NOT NULL DEFAULT 0,
    cost_impact_paise BIGINT NOT NULL DEFAULT 0,
    total_value_paise BIGINT NOT NULL DEFAULT 0,
    reason VARCHAR(50) NOT NULL, -- 'SPOILAGE', 'EXPIRY', 'SPILLAGE', 'PREPARATION_WASTE', 'QUALITY_REJECTION', 'OTHER'
    notes TEXT,
    reported_by VARCHAR(100),
    reported_by_staff_id UUID,
    idempotency_key VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wastage_records_restaurant_date ON wastage_records(restaurant_id, created_at);
-- ==============================================================================
-- 20261027000004_coupons_and_reservations.sql
-- HOTEL_CRM Coupons, Redemptions, Auth Challenges, Reservations, and Feedback
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COUPONS (CAMPAIGN DEFINITIONS)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE', -- 'PERCENTAGE', 'FIXED'
    discount_value_paise BIGINT NOT NULL DEFAULT 0 CHECK (discount_value_paise >= 0),
    discount_percentage NUMERIC(5, 2) CHECK (discount_percentage IS NULL OR (discount_percentage > 0 AND discount_percentage <= 100)),
    min_order_value_paise BIGINT NOT NULL DEFAULT 0 CHECK (min_order_value_paise >= 0),
    max_discount_amount_paise BIGINT CHECK (max_discount_amount_paise IS NULL OR max_discount_amount_paise > 0),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    is_targeted BOOLEAN NOT NULL DEFAULT FALSE,
    total_usage_limit INT NOT NULL DEFAULT 1000 CHECK (total_usage_limit >= 0),
    per_customer_limit INT NOT NULL DEFAULT 1 CHECK (per_customer_limit >= 0),
    redemption_count INT NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_coupon_code UNIQUE (restaurant_id, code),
    CONSTRAINT chk_coupon_dates CHECK (valid_until >= valid_from)
);
CREATE INDEX IF NOT EXISTS idx_coupons_lookup ON coupons(restaurant_id, code, is_active);

-- ------------------------------------------------------------------------------
-- 2. TARGETED COUPON ASSIGNMENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES staff_members(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    max_redemptions INT NOT NULL DEFAULT 1 CHECK (max_redemptions > 0),
    redemptions_used INT NOT NULL DEFAULT 0 CHECK (redemptions_used >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED'
    notes TEXT,
    CONSTRAINT uq_coupon_customer_assignment UNIQUE (coupon_id, customer_id),
    CONSTRAINT chk_assignment_dates CHECK (valid_until >= valid_from),
    CONSTRAINT chk_assignment_quota CHECK (redemptions_used <= max_redemptions)
);
CREATE INDEX IF NOT EXISTS idx_assignments_customer ON coupon_assignments(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_coupon ON coupon_assignments(coupon_id);

-- ------------------------------------------------------------------------------
-- 3. COUPON REDEMPTIONS (IMMUTABLE AUDIT RECORD)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES coupon_assignments(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    discount_amount_applied_paise BIGINT NOT NULL CHECK (discount_amount_applied_paise > 0),
    idempotency_key VARCHAR(64) NOT NULL UNIQUE,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_redemption_order UNIQUE (order_id)
);
CREATE INDEX IF NOT EXISTS idx_redemptions_customer_coupon ON coupon_redemptions(customer_id, coupon_id);

-- ------------------------------------------------------------------------------
-- 4. CUSTOMER PHONE AUTH CHALLENGES
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 5. RESERVATIONS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_phone_e164 VARCHAR(20) NOT NULL,
    party_size INT NOT NULL CHECK (party_size > 0),
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED', -- 'PENDING', 'CONFIRMED', 'SEATED', 'CANCELLED', 'NO_SHOW'
    special_requests TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date ON reservations(restaurant_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(restaurant_id, status);

-- ------------------------------------------------------------------------------
-- 6. FEEDBACK
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    food_rating INT CHECK (food_rating >= 1 AND food_rating <= 5),
    service_rating INT CHECK (service_rating >= 1 AND service_rating <= 5),
    ambiance_rating INT CHECK (ambiance_rating >= 1 AND ambiance_rating <= 5),
    comments TEXT,
    response TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW', -- 'NEW', 'REVIEWED', 'RESOLVED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_feedback_restaurant ON customer_feedback(restaurant_id, created_at);
-- ==============================================================================
-- 20261027000005_rls_and_functions.sql
-- HOTEL_CRM Multi-Tenant Row Level Security (RLS) & Stored Functions
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ENABLE ROW LEVEL SECURITY
-- ------------------------------------------------------------------------------
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE customer_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS FOR CONTEXT RESOLUTION
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_staff_restaurant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id', '')::UUID;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_customer_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'customer_id', '')::UUID,
    NULLIF(auth.uid()::text, '')::UUID
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_staff_role()
RETURNS VARCHAR AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'role', ''),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->'app_metadata'->>'role', ''),
    'STAFF'
  );
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------------------------
-- 3. RLS POLICIES FOR TENANT & CUSTOMER ISOLATION
-- ------------------------------------------------------------------------------

-- RESTAURANTS: Active restaurants are publicly readable; staff only for admin updates
CREATE POLICY restaurants_public_read ON restaurants
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY restaurants_staff_manage ON restaurants
    FOR ALL USING (id = current_staff_restaurant_id());

-- STAFF: Staff view members in their own restaurant; Admins/Managers manage them
CREATE POLICY staff_members_tenant_read ON staff_members
    FOR SELECT USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY staff_members_admin_manage ON staff_members
    FOR ALL USING (
        restaurant_id = current_staff_restaurant_id()
        AND current_staff_role() IN ('ADMIN', 'MANAGER')
    );

-- CUSTOMERS: Staff manage all within tenant; Customers see & edit ONLY their own profile
CREATE POLICY customers_staff_manage ON customers
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY customers_customer_select ON customers
    FOR SELECT USING (id = current_customer_id());

CREATE POLICY customers_customer_update ON customers
    FOR UPDATE USING (id = current_customer_id())
    WITH CHECK (id = current_customer_id());

CREATE POLICY customers_anon_insert ON customers
    FOR INSERT WITH CHECK (TRUE);

-- MENU: Public read for active categories & items within active restaurants
CREATE POLICY menu_categories_public_read ON menu_categories
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY menu_categories_staff_manage ON menu_categories
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY menu_items_public_read ON menu_items
    FOR SELECT USING (is_available = TRUE);

CREATE POLICY menu_items_staff_manage ON menu_items
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- TABLES: QR token scan allows public read of table info
CREATE POLICY tables_read ON tables
    FOR SELECT USING (TRUE);

CREATE POLICY tables_staff_manage ON tables
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- ORDERS: Staff see restaurant orders; customers see ONLY their own
CREATE POLICY orders_staff_manage ON orders
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY orders_customer_select ON orders
    FOR SELECT USING (customer_id = current_customer_id());

CREATE POLICY order_items_staff_manage ON order_items
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.restaurant_id = current_staff_restaurant_id()
        )
    );

CREATE POLICY order_items_customer_select ON order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders o
            WHERE o.id = order_items.order_id
              AND o.customer_id = current_customer_id()
        )
    );

-- BILLING & PAYMENTS: Staff managed (Cashier, Manager, Admin)
CREATE POLICY split_bills_staff_manage ON split_bills
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY payments_staff_manage ON payments
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY refunds_staff_manage ON refunds
    FOR ALL USING (
        restaurant_id = current_staff_restaurant_id()
        AND current_staff_role() IN ('ADMIN', 'MANAGER')
    );

CREATE POLICY invoices_staff_manage ON invoices
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- INVENTORY & RECIPES: Staff access only (Kitchen, Manager, Admin)
CREATE POLICY inventory_items_staff_manage ON inventory_items
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY recipes_staff_manage ON recipes
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY stock_movements_staff_manage ON stock_movements
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY wastage_records_staff_manage ON wastage_records
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- COUPONS: Public non-targeted active coupons readable; staff manage all
CREATE POLICY coupons_public_read ON coupons
    FOR SELECT USING (is_active = TRUE AND is_targeted = FALSE);

CREATE POLICY coupons_staff_manage ON coupons
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- COUPON ASSIGNMENTS: Customer sees ONLY their own assigned coupons
CREATE POLICY coupon_assignments_customer_read ON coupon_assignments
    FOR SELECT USING (customer_id = current_customer_id());

CREATE POLICY coupon_assignments_staff_manage ON coupon_assignments
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- RESERVATIONS: Customer can view/create own; staff manage all
CREATE POLICY reservations_staff_manage ON reservations
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY reservations_customer_select ON reservations
    FOR SELECT USING (customer_id = current_customer_id());

CREATE POLICY customer_feedback_staff_manage ON customer_feedback
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY customer_feedback_customer_manage ON customer_feedback
    FOR ALL USING (customer_id = current_customer_id());

-- AUDIT & IDEMPOTENCY: Restricted to staff tenant
CREATE POLICY audit_logs_staff_read ON audit_logs
    FOR SELECT USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY idempotency_staff_manage ON idempotency_records
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- ------------------------------------------------------------------------------
-- 4. CONCURRENCY-SAFE STORED PROCEDURES
-- ------------------------------------------------------------------------------

-- Authoritative server-side coupon validation with row locking
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
            format('Minimum tray value of â‚¹%s required', (v_coupon.min_order_value_paise / 100)::TEXT)::TEXT;
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
        v_calculated_discount := v_coupon.discount_value_paise;
    ELSIF v_coupon.discount_type = 'PERCENTAGE' THEN
        v_calculated_discount := ROUND((p_cart_subtotal_paise * v_coupon.discount_percentage) / 100.0);
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
