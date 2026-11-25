ALTER TABLE orders ADD COLUMN applied_coupon_code TEXT;
CREATE UNIQUE INDEX coupon_order_once ON coupon_redemptions(order_id);
