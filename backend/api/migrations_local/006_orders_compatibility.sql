-- Orders compatibility migration
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS whatsapp_templates JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone_e164 VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pickup_reference VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS applied_coupon_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);

-- Customer feedback compatibility
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_id UUID;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100);
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50);
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS food_rating INT;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS service_rating INT;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS ambience_rating INT;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS is_resolved BOOLEAN DEFAULT FALSE;
ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

