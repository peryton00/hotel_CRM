CREATE TABLE refunds (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 order_id TEXT NOT NULL REFERENCES orders(id), payment_id TEXT REFERENCES payments(id),
 refund_amount_paise INTEGER NOT NULL CHECK(refund_amount_paise>0), reason TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('requested','completed','cancelled')),
 requested_at TEXT NOT NULL, completed_at TEXT, cancelled_at TEXT, refund_method TEXT,
 processed_by_staff_id TEXT REFERENCES users(id), idempotency_key TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(restaurant_id,idempotency_key)
);
CREATE INDEX refunds_order ON refunds(order_id,status);
CREATE TABLE split_bills (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 split_number INTEGER NOT NULL, split_total_count INTEGER NOT NULL,
 split_type TEXT NOT NULL, amount_paise INTEGER NOT NULL CHECK(amount_paise>0),
 payment_status TEXT NOT NULL DEFAULT 'unpaid', payment_id TEXT REFERENCES payments(id),
 payment_method TEXT, settled_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id,split_number)
);
ALTER TABLE payments ADD COLUMN split_bill_id TEXT REFERENCES split_bills(id);
ALTER TABLE orders ADD COLUMN is_split INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN split_count INTEGER NOT NULL DEFAULT 1;
