ALTER TABLE orders ADD COLUMN order_number TEXT;
ALTER TABLE orders ADD COLUMN pickup_reference TEXT;
ALTER TABLE orders ADD COLUMN seating_session_id TEXT;
ALTER TABLE orders ADD COLUMN settled_at TEXT;
ALTER TABLE orders ADD COLUMN payment_method TEXT;
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX payment_request ON payments(restaurant_id,idempotency_key);
ALTER TABLE invoices ADD COLUMN receipt_json TEXT;
