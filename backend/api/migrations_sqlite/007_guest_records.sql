CREATE TABLE customers (
 id TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL REFERENCES restaurants(id),name TEXT NOT NULL,
 phone TEXT NOT NULL,email TEXT,address TEXT,notes TEXT,visit_count INTEGER NOT NULL DEFAULT 0,
 total_spend_paise INTEGER NOT NULL DEFAULT 0,loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK(loyalty_points>=0),
 loyalty_tier TEXT NOT NULL DEFAULT 'STANDARD',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(restaurant_id,phone)
);
CREATE TABLE reservations (
 id TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL REFERENCES restaurants(id),table_id TEXT REFERENCES tables(id),
 customer_id TEXT REFERENCES customers(id),customer_name TEXT NOT NULL,customer_phone TEXT NOT NULL,
 guest_count INTEGER NOT NULL CHECK(guest_count>0),reservation_time TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'confirmed',
 special_requests TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX reservation_calendar ON reservations(restaurant_id,reservation_time);
CREATE TABLE feedback (
 id TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL REFERENCES restaurants(id),order_id TEXT REFERENCES orders(id),
 customer_name TEXT,customer_phone TEXT,rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),comments TEXT,
 resolution_note TEXT,is_resolved INTEGER NOT NULL DEFAULT 0,is_public INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
