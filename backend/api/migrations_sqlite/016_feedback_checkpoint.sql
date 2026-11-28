CREATE TABLE feedback_checkpoint(restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id), created_at TEXT NOT NULL, id TEXT NOT NULL);
