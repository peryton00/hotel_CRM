ALTER TABLE restaurants ADD COLUMN cgst_rate REAL;
ALTER TABLE restaurants ADD COLUMN sgst_rate REAL;
ALTER TABLE restaurants ADD COLUMN google_review_url TEXT;
ALTER TABLE restaurants ADD COLUMN whatsapp_templates TEXT;
ALTER TABLE inventory_items ADD COLUMN category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE inventory_items ADD COLUMN reserved_stock REAL NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX wastage_request ON wastage_records(restaurant_id,idempotency_key);
CREATE TABLE staff_attendance (
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),staff_id TEXT NOT NULL REFERENCES users(id),
 attendance_date TEXT NOT NULL,status TEXT NOT NULL,notes TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(staff_id,attendance_date)
);
