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
