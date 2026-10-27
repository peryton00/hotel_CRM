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
  SELECT NULLIF(auth.uid()::text, '')::UUID;
$$ LANGUAGE sql STABLE;

-- ------------------------------------------------------------------------------
-- 3. RLS POLICIES FOR TENANT ISOLATION
-- ------------------------------------------------------------------------------

-- RESTAURANTS: Active restaurants are publicly readable; staff only for admin updates
CREATE POLICY restaurants_public_read ON restaurants
    FOR SELECT USING (is_active = TRUE);

CREATE POLICY restaurants_staff_manage ON restaurants
    FOR ALL USING (id = current_staff_restaurant_id());

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

-- ORDERS: Staff see restaurant orders; customers see their own
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

-- BILLING & PAYMENTS: Staff managed
CREATE POLICY split_bills_staff_manage ON split_bills
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY payments_staff_manage ON payments
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY refunds_staff_manage ON refunds
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY invoices_staff_manage ON invoices
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- INVENTORY & RECIPES: Staff access only
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

CREATE POLICY coupon_assignments_customer_read ON coupon_assignments
    FOR SELECT USING (customer_id = current_customer_id());

CREATE POLICY coupon_assignments_staff_manage ON coupon_assignments
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

-- RESERVATIONS: Customer can view/create own; staff manage all
CREATE POLICY reservations_staff_manage ON reservations
    FOR ALL USING (restaurant_id = current_staff_restaurant_id());

CREATE POLICY reservations_customer_select ON reservations
    FOR SELECT USING (customer_id = current_customer_id());

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
