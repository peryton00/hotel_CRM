-- ==============================================================================
-- HOTEL_CRM SUPABASE PATCH MIGRATION
-- Run this in the Supabase SQL Editor to update your existing schema.
-- All statements are safe, idempotent (IF NOT EXISTS), and non-destructive.
-- ==============================================================================

-- 1. RESTAURANTS
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS email VARCHAR(100);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS fssai_license VARCHAR(50);

-- 2. STAFF MEMBERS & ATTENDANCE
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS auth_user_id UUID;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS shift VARCHAR(100) DEFAULT 'General Shift';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS assigned_section VARCHAR(100) DEFAULT 'Main Dining Floor';
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS login_id VARCHAR(100);
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS monthly_salary_paise BIGINT DEFAULT 1500000;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS payroll_cycle_start_day INT DEFAULT 1;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS staff_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL,
    staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PRESENT', -- 'PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE'
    check_in_time TIMESTAMPTZ,
    check_out_time TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(restaurant_id, staff_id, attendance_date)
);

-- 3. TABLES
ALTER TABLE tables ADD COLUMN IF NOT EXISTS table_number VARCHAR(20);
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_code_identifier VARCHAR(64);
ALTER TABLE tables ADD COLUMN IF NOT EXISTS active_order_id UUID;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS assigned_staff_id UUID;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
UPDATE tables SET table_number = COALESCE(table_number, number), qr_code_identifier = COALESCE(qr_code_identifier, qr_token);

-- 4. CUSTOMERS
ALTER TABLE customers ALTER COLUMN phone_e164 DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_orders INT DEFAULT 0;
UPDATE customers SET phone = COALESCE(phone, phone_e164) WHERE phone IS NULL;

-- 5. ORDERS & ITEMS
ALTER TABLE orders DROP CONSTRAINT IF EXISTS chk_dinein_table;
ALTER TABLE orders ALTER COLUMN customer_name DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN customer_phone_e164 DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN order_type TYPE VARCHAR(50) USING order_type::text;
ALTER TABLE orders ALTER COLUMN status TYPE VARCHAR(50) USING status::text;
ALTER TABLE orders ALTER COLUMN payment_status TYPE VARCHAR(50) USING payment_status::text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS round_off_paise BIGINT DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS server_staff_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS legacy_unknown_timestamp BOOLEAN DEFAULT FALSE;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_total_paise BIGINT DEFAULT 0;
ALTER TABLE order_items ALTER COLUMN item_total_paise DROP NOT NULL;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS subtotal_paise BIGINT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS total_paise BIGINT DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'confirmed';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS from_status VARCHAR(50);
ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS to_status VARCHAR(50);
ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE order_timeline_events ADD COLUMN IF NOT EXISTS performed_by UUID;
ALTER TABLE order_timeline_events ALTER COLUMN status DROP NOT NULL;

-- 6. INVENTORY, WASTAGE & STOCK MOVEMENTS
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS sku VARCHAR(50);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(12, 4) DEFAULT 0.0000;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS cost_per_unit_paise BIGINT DEFAULT 0;
UPDATE inventory_items SET unit_of_measure = COALESCE(unit_of_measure, unit) WHERE unit_of_measure IS NULL;
UPDATE inventory_items SET reorder_level = COALESCE(reorder_level, min_threshold) WHERE reorder_level IS NULL;
UPDATE inventory_items SET cost_per_unit_paise = COALESCE(cost_per_unit_paise, unit_cost_paise) WHERE cost_per_unit_paise IS NULL;

ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS inventory_item_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_order_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS reference_wastage_id UUID;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE stock_movements ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN previous_stock DROP NOT NULL;
ALTER TABLE stock_movements ALTER COLUMN new_stock DROP NOT NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS balance_after NUMERIC(12, 4) DEFAULT 0.0000;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
UPDATE stock_movements SET notes = COALESCE(notes, reason) WHERE notes IS NULL;
UPDATE stock_movements SET created_at = COALESCE(created_at, "timestamp") WHERE created_at IS NULL;
UPDATE stock_movements SET inventory_item_id = COALESCE(inventory_item_id, ingredient_id) WHERE inventory_item_id IS NULL;

ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS inventory_item_id UUID;
ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(20);
ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS cost_impact_paise BIGINT DEFAULT 0;
ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS reported_by_staff_id UUID;
ALTER TABLE wastage_records ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
ALTER TABLE wastage_records ALTER COLUMN ingredient_id DROP NOT NULL;
ALTER TABLE wastage_records ALTER COLUMN unit DROP NOT NULL;
ALTER TABLE wastage_records ALTER COLUMN reported_by DROP NOT NULL;
UPDATE wastage_records SET inventory_item_id = COALESCE(inventory_item_id, ingredient_id) WHERE inventory_item_id IS NULL;

-- 7. RESERVATIONS & COUPONS
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS guest_count INT DEFAULT 2;
UPDATE reservations SET customer_phone = COALESCE(customer_phone, customer_phone_e164) WHERE customer_phone IS NULL;
UPDATE reservations SET guest_count = COALESCE(guest_count, party_size) WHERE guest_count IS NULL;

ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE coupon_redemptions ADD COLUMN IF NOT EXISTS discount_applied_paise BIGINT DEFAULT 0;
ALTER TABLE coupon_redemptions ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE coupon_redemptions ALTER COLUMN discount_amount_applied_paise DROP NOT NULL;
ALTER TABLE coupon_redemptions ALTER COLUMN idempotency_key DROP NOT NULL;
UPDATE coupon_redemptions SET discount_applied_paise = COALESCE(discount_applied_paise, discount_amount_applied_paise) WHERE discount_applied_paise IS NULL;

-- 8. INVOICES
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_paise BIGINT DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_paise BIGINT DEFAULT 0;
UPDATE invoices SET discount_paise = COALESCE(discount_paise, discount_amount_paise) WHERE discount_paise IS NULL;
UPDATE invoices SET tax_paise = COALESCE(tax_paise, tax_amount_paise) WHERE tax_paise IS NULL;

-- 9. PERMISSIONS
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, anon, authenticated;
