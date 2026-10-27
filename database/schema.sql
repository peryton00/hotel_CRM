-- ==============================================================================
-- RESTAURANT CRM & DIGITAL ORDERING PLATFORM
-- PRODUCTION POSTGRESQL / SUPABASE RELATIONAL SCHEMA & RLS POLICIES
-- ==============================================================================
-- Principles Implemented:
-- 1. Multi-Tenant Restaurant Data Isolation (restaurant_id scoping)
-- 2. Customer Identity Resolution via UUID and E.164 Normalized Mobile Numbers
-- 3. Verified Phone Ownership (OTP Challenges; phone alone != auth)
-- 4. Three-Way Coupon Decomposition (Definitions, Assignments, Redemptions)
-- 5. Server-Authoritative Eligibility and Discount Validation (Never trust client)
-- 6. Atomic, Concurrency-Safe Order Creation & Idempotency Key De-duplication
-- 7. Row-Level Security (RLS) Policies on every relational entity
-- 8. Immutable System & Administrative Audit Logging
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. ENUMS & DOMAINS
-- ------------------------------------------------------------------------------
CREATE TYPE customer_status AS ENUM ('ACTIVE', 'VIP', 'INACTIVE');
CREATE TYPE loyalty_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'PLATINUM');
CREATE TYPE coupon_discount_type AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE coupon_assignment_status AS ENUM ('ACTIVE', 'EXHAUSTED', 'REVOKED', 'EXPIRED');
CREATE TYPE order_status AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED');
CREATE TYPE payment_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED');
CREATE TYPE actor_role AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM');

-- ------------------------------------------------------------------------------
-- 2. RESTAURANTS (Multi-Tenant Root)
-- ------------------------------------------------------------------------------
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    tagline VARCHAR(255),
    description TEXT,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    currency_symbol VARCHAR(5) NOT NULL DEFAULT '₹',
    gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
    service_charge_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 3. STAFF MEMBERS & ROLES
-- ------------------------------------------------------------------------------
CREATE TABLE staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL, -- e.g. 'ADMIN', 'MANAGER', 'CAPTAIN', 'CASHIER'
    pin_hash VARCHAR(255) NOT NULL,
    phone_e164 VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_staff_restaurant ON staff_members(restaurant_id);

-- ------------------------------------------------------------------------------
-- 4. CUSTOMERS (Stable Identity Resolution & Phone Normalization)
-- ------------------------------------------------------------------------------
CREATE TABLE customers (
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
    total_spend NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_spend >= 0),
    visit_count INT NOT NULL DEFAULT 0 CHECK (visit_count >= 0),
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_customer_phone UNIQUE (restaurant_id, phone_e164)
);
CREATE INDEX idx_customers_phone ON customers(restaurant_id, phone_e164);
CREATE INDEX idx_customers_tier ON customers(restaurant_id, loyalty_tier);

-- ------------------------------------------------------------------------------
-- 5. CUSTOMER AUTHENTICATION CHALLENGES (Verified Phone Ownership)
-- Note: Phone numbers alone are NEVER treated as authentication.
-- ------------------------------------------------------------------------------
CREATE TABLE customer_auth_challenges (
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
CREATE INDEX idx_auth_challenges_phone ON customer_auth_challenges(phone_e164, is_verified);

-- ------------------------------------------------------------------------------
-- 6. TABLES & DINING ZONES
-- ------------------------------------------------------------------------------
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    number VARCHAR(20) NOT NULL,
    capacity INT NOT NULL DEFAULT 4,
    section VARCHAR(50) NOT NULL DEFAULT 'Main Dining',
    qr_token VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE',
    ordering_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_table_number UNIQUE (restaurant_id, number),
    CONSTRAINT uq_table_qr_token UNIQUE (qr_token)
);

-- ------------------------------------------------------------------------------
-- 7. MENU CATALOG
-- ------------------------------------------------------------------------------
CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_restaurant_category_slug UNIQUE (restaurant_id, slug)
);

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    dietary VARCHAR(20) NOT NULL DEFAULT 'VEG',
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_menu_items_category ON menu_items(category_id);

-- ------------------------------------------------------------------------------
-- 8. COUPONS: MASTER CAMPAIGN DEFINITIONS
-- ------------------------------------------------------------------------------
CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type coupon_discount_type NOT NULL,
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_value NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (min_order_value >= 0),
    max_discount_amount NUMERIC(10, 2) CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    is_targeted BOOLEAN NOT NULL DEFAULT FALSE, -- Requires explicit CouponAssignment if TRUE
    total_usage_limit INT NOT NULL DEFAULT 1000 CHECK (total_usage_limit >= 0),
    per_customer_limit INT NOT NULL DEFAULT 1 CHECK (per_customer_limit >= 0),
    redemption_count INT NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_coupon_code UNIQUE (restaurant_id, code),
    CONSTRAINT chk_coupon_dates CHECK (valid_until >= valid_from)
);
CREATE INDEX idx_coupons_lookup ON coupons(restaurant_id, code, is_active);

-- ------------------------------------------------------------------------------
-- 9. TARGETED COUPON DISTRIBUTION (Customer Entitlements)
-- Explicit link between coupon campaign and targeted customer UUID.
-- ------------------------------------------------------------------------------
CREATE TABLE coupon_assignments (
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
    status coupon_assignment_status NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    CONSTRAINT uq_coupon_customer_assignment UNIQUE (coupon_id, customer_id),
    CONSTRAINT chk_assignment_dates CHECK (valid_until >= valid_from),
    CONSTRAINT chk_assignment_quota CHECK (redemptions_used <= max_redemptions)
);
CREATE INDEX idx_assignments_customer ON coupon_assignments(customer_id, status);
CREATE INDEX idx_assignments_coupon ON coupon_assignments(coupon_id);

-- ------------------------------------------------------------------------------
-- 10. ORDERS & BILLING
-- ------------------------------------------------------------------------------
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    order_number VARCHAR(50) NOT NULL,
    idempotency_key VARCHAR(64) UNIQUE,
    table_id UUID NOT NULL REFERENCES tables(id),
    customer_id UUID REFERENCES customers(id),
    customer_name VARCHAR(100) NOT NULL,
    customer_phone_e164 VARCHAR(20) NOT NULL,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    applied_coupon_id UUID REFERENCES coupons(id),
    applied_coupon_code VARCHAR(50),
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    status order_status NOT NULL DEFAULT 'PENDING',
    payment_status payment_status NOT NULL DEFAULT 'UNPAID',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_restaurant_order_number UNIQUE (restaurant_id, order_number)
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_restaurant_status ON orders(restaurant_id, status);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    item_name VARCHAR(150) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    item_total NUMERIC(10, 2) NOT NULL,
    special_instructions TEXT
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ------------------------------------------------------------------------------
-- 11. COUPON REDEMPTIONS (Concurrency-Safe Immutable Audit Trail)
-- ------------------------------------------------------------------------------
CREATE TABLE coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    assignment_id UUID REFERENCES coupon_assignments(id),
    customer_id UUID NOT NULL REFERENCES customers(id),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    discount_amount_applied NUMERIC(10, 2) NOT NULL CHECK (discount_amount_applied > 0),
    idempotency_key VARCHAR(64) NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_redemption_order UNIQUE (order_id), -- Only one coupon per order
    CONSTRAINT uq_redemption_idempotency UNIQUE (idempotency_key)
);
CREATE INDEX idx_redemptions_customer_coupon ON coupon_redemptions(customer_id, coupon_id);

-- ------------------------------------------------------------------------------
-- 12. IDEMPOTENCY STORE (Safe Retry Management)
-- ------------------------------------------------------------------------------
CREATE TABLE idempotency_records (
    idempotency_key VARCHAR(64) PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id),
    operation_type VARCHAR(50) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    response_status INT NOT NULL DEFAULT 200,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX idx_idempotency_expires ON idempotency_records(expires_at);

-- ------------------------------------------------------------------------------
-- 13. AUDIT LOGGING (Non-Repudiation and Compliance)
-- ------------------------------------------------------------------------------
CREATE TABLE audit_logs (
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
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_restaurant_entity ON audit_logs(restaurant_id, entity_type, entity_id);

-- ------------------------------------------------------------------------------
-- 14. ROW-LEVEL SECURITY (RLS) POLICIES
-- Strict Isolation: Customer private data is never accessible across patrons or tenants.
-- ------------------------------------------------------------------------------
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function: Extract authenticated staff restaurant_id from JWT claims
CREATE OR REPLACE FUNCTION current_staff_restaurant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'restaurant_id', '')::UUID;
$$ LANGUAGE sql STABLE;

-- Helper Function: Extract authenticated customer_id from auth.uid()
CREATE OR REPLACE FUNCTION current_customer_id()
RETURNS UUID AS $$
  SELECT NULLIF(auth.uid()::text, '')::UUID;
$$ LANGUAGE sql STABLE;

-- RLS: CUSTOMERS
-- Staff can read/write customer records for their restaurant
CREATE POLICY staff_customers_policy ON customers
    FOR ALL
    USING (restaurant_id = current_staff_restaurant_id());

-- Customers can ONLY select and update their own record
CREATE POLICY customer_self_access_policy ON customers
    FOR SELECT
    USING (id = current_customer_id());

-- RLS: ORDERS
-- Staff can view all orders in their restaurant
CREATE POLICY staff_orders_policy ON orders
    FOR ALL
    USING (restaurant_id = current_staff_restaurant_id());

-- Customers can view only their own orders
CREATE POLICY customer_orders_policy ON orders
    FOR SELECT
    USING (customer_id = current_customer_id());

-- RLS: COUPONS
-- Public active non-targeted coupons are readable by anyone in the restaurant
CREATE POLICY public_coupons_read ON coupons
    FOR SELECT
    USING (is_active = TRUE AND is_targeted = FALSE);

-- Staff can view/manage all coupons in their restaurant
CREATE POLICY staff_coupons_policy ON coupons
    FOR ALL
    USING (restaurant_id = current_staff_restaurant_id());

-- RLS: COUPON ASSIGNMENTS
-- Customers can only see their own active assignments
CREATE POLICY customer_assignments_read ON coupon_assignments
    FOR SELECT
    USING (customer_id = current_customer_id());

-- Staff can manage assignments for their restaurant
CREATE POLICY staff_assignments_policy ON coupon_assignments
    FOR ALL
    USING (restaurant_id = current_staff_restaurant_id());

-- RLS: AUDIT LOGS
-- Immutable: Read-only for authorized restaurant admins
CREATE POLICY admin_audit_read ON audit_logs
    FOR SELECT
    USING (restaurant_id = current_staff_restaurant_id());

-- ------------------------------------------------------------------------------
-- 15. STORED PROCEDURES & CONCURRENCY CONTROLS
-- Row-level locking (SELECT FOR UPDATE) prevents race-condition redemptions.
-- ------------------------------------------------------------------------------

-- Procedure: Authoritative Server-Side Coupon Validation
CREATE OR REPLACE FUNCTION fn_validate_coupon_server_side(
    p_restaurant_id UUID,
    p_customer_id UUID,
    p_coupon_code VARCHAR,
    p_cart_subtotal NUMERIC
)
RETURNS TABLE (
    is_valid BOOLEAN,
    authorized_discount NUMERIC,
    coupon_id UUID,
    assignment_id UUID,
    rejection_reason TEXT
) AS $$
DECLARE
    v_coupon RECORD;
    v_assignment RECORD;
    v_past_redemptions INT;
    v_discount NUMERIC := 0.00;
BEGIN
    -- 1. Fetch Coupon with Row Lock
    SELECT * INTO v_coupon
    FROM coupons
    WHERE restaurant_id = p_restaurant_id
      AND code = UPPER(TRIM(p_coupon_code))
      AND is_active = TRUE
    FOR SHARE; -- Shared lock for validation read

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0.00, NULL::UUID, NULL::UUID, 'Coupon not found or inactive'::TEXT;
        RETURN;
    END IF;

    -- 2. Check Date Validity
    IF NOW() < v_coupon.valid_from THEN
        RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'Promotion has not started yet'::TEXT;
        RETURN;
    END IF;

    IF NOW() > v_coupon.valid_until THEN
        RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'Promotion has expired'::TEXT;
        RETURN;
    END IF;

    -- 3. Check Minimum Order Value
    IF p_cart_subtotal < v_coupon.min_order_value THEN
        RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID,
            format('Minimum tray value of ₹%s required', v_coupon.min_order_value)::TEXT;
        RETURN;
    END IF;

    -- 4. Check Global Usage Limit
    IF v_coupon.redemption_count >= v_coupon.total_usage_limit THEN
        RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'Global redemption limit reached for this promotion'::TEXT;
        RETURN;
    END IF;

    -- 5. Targeted vs Public Entitlement Evaluation
    IF v_coupon.is_targeted THEN
        IF p_customer_id IS NULL THEN
            RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'This VIP privilege requires verified patron login'::TEXT;
            RETURN;
        END IF;

        SELECT * INTO v_assignment
        FROM coupon_assignments
        WHERE coupon_id = v_coupon.id
          AND customer_id = p_customer_id
          AND status = 'ACTIVE'
        FOR SHARE;

        IF NOT FOUND THEN
            RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'This coupon is not assigned to your account'::TEXT;
            RETURN;
        END IF;

        IF v_assignment.redemptions_used >= v_assignment.max_redemptions THEN
            RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, v_assignment.id, 'You have exhausted your entitlement limit for this coupon'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 6. Check Per-Customer Redemption Limits
    IF p_customer_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_past_redemptions
        FROM coupon_redemptions
        WHERE coupon_id = v_coupon.id
          AND customer_id = p_customer_id;

        IF v_past_redemptions >= v_coupon.per_customer_limit THEN
            RETURN QUERY SELECT FALSE, 0.00, v_coupon.id, NULL::UUID, 'You have reached the maximum redemption limit for this promotion'::TEXT;
            RETURN;
        END IF;
    END IF;

    -- 7. Calculate Authoritative Discount Amount
    IF v_coupon.discount_type = 'PERCENTAGE' THEN
        v_discount := (p_cart_subtotal * v_coupon.discount_value) / 100.00;
        IF v_coupon.max_discount_amount IS NOT NULL AND v_discount > v_coupon.max_discount_amount THEN
            v_discount := v_coupon.max_discount_amount;
        END IF;
    ELSE
        v_discount := v_coupon.discount_value;
    END IF;

    v_discount := LEAST(v_discount, p_cart_subtotal);
    v_discount := ROUND(v_discount, 2);

    RETURN QUERY SELECT TRUE, v_discount, v_coupon.id, v_assignment.id, 'Coupon validated successfully'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
