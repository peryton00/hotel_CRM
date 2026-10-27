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
