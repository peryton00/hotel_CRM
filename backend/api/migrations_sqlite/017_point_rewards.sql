CREATE TABLE imported_point_rewards(request_id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(id),coupon_id TEXT NOT NULL REFERENCES coupons(id));
DROP TRIGGER wallet_insert;
DROP TRIGGER wallet_update;
CREATE TRIGGER wallet_insert AFTER INSERT ON reward_wallet BEGIN
 INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
 SELECT lower(hex(randomblob(16))),'wallet',NEW.id,'WALLET_UPDATED',json_object(
 'restaurant_id',NEW.restaurant_id,'phone',u.phone,'name',u.name,'code',c.code,'title',c.title,
 'discount_type',c.discount_type,'discount_value',c.discount_value,'min',c.min_order_amount_paise,'cap',c.max_discount_paise,
 'start',c.start_date,'end',c.end_date,'active',c.is_active,'limit',NEW.max_redemptions-(SELECT count(*) FROM imported_point_rewards WHERE customer_id=NEW.customer_id AND coupon_id=NEW.coupon_id),'status',NEW.status),lower(hex(randomblob(16)))
 FROM customers u JOIN coupons c ON c.id=NEW.coupon_id WHERE u.id=NEW.customer_id;
END;
CREATE TRIGGER wallet_update AFTER UPDATE ON reward_wallet BEGIN
 INSERT INTO sync_outbox(event_id,aggregate_type,aggregate_id,event_type,payload,idempotency_key)
 SELECT lower(hex(randomblob(16))),'wallet',NEW.id,'WALLET_UPDATED',json_object(
 'restaurant_id',NEW.restaurant_id,'phone',u.phone,'name',u.name,'code',c.code,'title',c.title,
 'discount_type',c.discount_type,'discount_value',c.discount_value,'min',c.min_order_amount_paise,'cap',c.max_discount_paise,
 'start',c.start_date,'end',c.end_date,'active',c.is_active,'limit',NEW.max_redemptions-(SELECT count(*) FROM imported_point_rewards WHERE customer_id=NEW.customer_id AND coupon_id=NEW.coupon_id),'status',NEW.status),lower(hex(randomblob(16)))
 FROM customers u JOIN coupons c ON c.id=NEW.coupon_id WHERE u.id=NEW.customer_id;
END;
