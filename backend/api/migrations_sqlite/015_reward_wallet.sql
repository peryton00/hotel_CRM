CREATE TABLE reward_policy(restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id), config TEXT NOT NULL);
CREATE TABLE reward_wallet(
 id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
 coupon_id TEXT NOT NULL REFERENCES coupons(id), customer_id TEXT NOT NULL REFERENCES customers(id),
 max_redemptions INTEGER NOT NULL CHECK(max_redemptions>0),status TEXT NOT NULL DEFAULT 'ACTIVE',
 assigned_by TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(coupon_id,customer_id));
CREATE VIEW wallet_details AS SELECT w.id,w.restaurant_id AS restaurantId,w.customer_id AS customerId,w.coupon_id AS couponId,
 c.code AS couponCode,u.phone AS customerPhoneE164,u.name AS customerName,w.assigned_by AS assignedBy,
 w.assigned_at AS assignedAt,c.start_date AS validFrom,c.end_date AS validUntil,w.max_redemptions AS maxRedemptions,
 (SELECT count(*) FROM coupon_redemptions r WHERE r.coupon_id=c.id AND r.customer_phone=u.phone) AS redemptionsUsed,
 w.status,w.notes FROM reward_wallet w JOIN coupons c ON c.id=w.coupon_id JOIN customers u ON u.id=w.customer_id;
CREATE TRIGGER visit_coupon AFTER UPDATE OF visit_count ON customers WHEN NEW.visit_count>OLD.visit_count BEGIN
 INSERT INTO reward_wallet(id,restaurant_id,coupon_id,customer_id,max_redemptions,assigned_by)
 SELECT lower(hex(randomblob(16))),NEW.restaurant_id,c.id,NEW.id,1,'Visit milestone' FROM reward_policy p JOIN coupons c
 ON c.restaurant_id=p.restaurant_id AND upper(c.code)=upper(json_extract(p.config,'$.couponCode'))
 WHERE p.restaurant_id=NEW.restaurant_id AND json_extract(p.config,'$.isActive') AND c.is_active
 AND NEW.visit_count % max(1,json_extract(p.config,'$.targetVisits'))=0
 ON CONFLICT(coupon_id,customer_id) DO UPDATE SET max_redemptions=max_redemptions+1,status='ACTIVE';
END;
CREATE TRIGGER wallet_insert AFTER INSERT ON reward_wallet BEGIN
 INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
 SELECT lower(hex(randomblob(16))),'wallet',NEW.id,'WALLET_UPDATED',json_object(
 'restaurant_id',NEW.restaurant_id,'phone',u.phone,'name',u.name,'code',c.code,'title',c.title,
 'discount_type',c.discount_type,'discount_value',c.discount_value,'min',c.min_order_amount_paise,'cap',c.max_discount_paise,
 'start',c.start_date,'end',c.end_date,'active',c.is_active,'limit',NEW.max_redemptions,'status',NEW.status),lower(hex(randomblob(16)))
 FROM customers u JOIN coupons c ON c.id=NEW.coupon_id WHERE u.id=NEW.customer_id;
END;
CREATE TRIGGER wallet_update AFTER UPDATE ON reward_wallet BEGIN
 INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
 SELECT lower(hex(randomblob(16))),'wallet',NEW.id,'WALLET_UPDATED',json_object(
 'restaurant_id',NEW.restaurant_id,'phone',u.phone,'name',u.name,'code',c.code,'title',c.title,
 'discount_type',c.discount_type,'discount_value',c.discount_value,'min',c.min_order_amount_paise,'cap',c.max_discount_paise,
 'start',c.start_date,'end',c.end_date,'active',c.is_active,'limit',NEW.max_redemptions,'status',NEW.status),lower(hex(randomblob(16)))
 FROM customers u JOIN coupons c ON c.id=NEW.coupon_id WHERE u.id=NEW.customer_id;
END;
