-- Upgrade databases created by migrations 001–006 without deleting operational rows.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cgst_rate numeric(5,2),
    ADD COLUMN IF NOT EXISTS sgst_rate numeric(5,2);
UPDATE restaurants SET cgst_rate = COALESCE(cgst_rate, gst_rate/2),
    sgst_rate = COALESCE(sgst_rate, gst_rate/2) WHERE cgst_rate IS NULL OR sgst_rate IS NULL;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS current_seating_session_id varchar(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS seating_session_id varchar(50),
    ADD COLUMN IF NOT EXISTS cgst_rate numeric(5,2), ADD COLUMN IF NOT EXISTS sgst_rate numeric(5,2);
CREATE INDEX IF NOT EXISTS orders_seating_session_idx ON orders(table_id, seating_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_restaurant_phone ON customers(restaurant_id, phone);

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS name varchar(150);
UPDATE order_items SET name=item_name WHERE name IS NULL;
ALTER TABLE order_items ALTER COLUMN name SET NOT NULL, ALTER COLUMN item_name DROP NOT NULL;
ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]';
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id),
    ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);
UPDATE reservations SET table_id=assigned_table_id WHERE table_id IS NULL;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS max_discount_amount_paise bigint GENERATED ALWAYS AS (max_discount_paise) STORED,
    ADD COLUMN IF NOT EXISTS is_targeted boolean NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS total_spent_paise bigint GENERATED ALWAYS AS (total_spend_paise) STORED;
ALTER TABLE split_bills ADD COLUMN IF NOT EXISTS amount_paise bigint,
    ADD COLUMN IF NOT EXISTS split_number integer GENERATED ALWAYS AS (split_index) STORED,
    ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id),
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE split_bills SET amount_paise=total_amount_paise WHERE amount_paise IS NULL;
ALTER TABLE split_bills ALTER COLUMN amount_paise SET NOT NULL,
    ALTER COLUMN total_amount_paise DROP NOT NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_paise bigint;
UPDATE invoices SET total_paise=total_amount_paise WHERE total_paise IS NULL;
ALTER TABLE invoices ALTER COLUMN total_paise SET NOT NULL, ALTER COLUMN total_amount_paise DROP NOT NULL;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id),
    ADD COLUMN IF NOT EXISTS refund_method varchar(50),
    ADD COLUMN IF NOT EXISTS processed_by_staff_id uuid REFERENCES staff_members(id),
    ADD COLUMN IF NOT EXISTS requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
    ADD COLUMN IF NOT EXISTS legacy_unknown_timestamp boolean NOT NULL DEFAULT false,
    ALTER COLUMN order_number DROP NOT NULL, ALTER COLUMN customer_name DROP NOT NULL;
UPDATE refunds SET requested_at=created_at WHERE requested_at IS NULL;
ALTER TABLE inventory_items ALTER COLUMN unit DROP NOT NULL;
CREATE TABLE IF NOT EXISTS restaurant_heartbeats (
    restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id), is_online boolean NOT NULL,
    last_seen_at timestamptz NOT NULL, metadata jsonb
);
