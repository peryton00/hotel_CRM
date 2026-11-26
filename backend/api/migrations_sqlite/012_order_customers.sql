-- One customer per restaurant and phone, one visit per seating (or per standalone order).
CREATE INDEX orders_customer_visits ON orders(restaurant_id, customer_id, seating_session_id);
CREATE VIEW customer_phone_lookup AS
SELECT id, restaurant_id, phone,
       replace(replace(replace(replace(replace(trim(phone),' ',''),'-',''),'+',''),'(',''),')','') AS digits
FROM customers;

CREATE TRIGGER link_order_customer AFTER UPDATE OF customer_phone_e164 ON orders
WHEN NEW.customer_id IS NULL AND length(trim(NEW.customer_phone_e164)) > 0
BEGIN
    INSERT INTO customers(id, restaurant_id, name, phone)
    SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2)
           || '-8' || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
           NEW.restaurant_id, coalesce(nullif(trim(NEW.customer_name),''),'Guest'),
           CASE WHEN length(d)=12 AND substr(d,1,2)='91' THEN substr(d,3) ELSE d END
    FROM (SELECT replace(replace(replace(replace(replace(trim(NEW.customer_phone_e164),' ',''),'-',''),'+',''),'(',''),')','') AS d)
    WHERE length(d)>=10 AND d NOT GLOB '*[^0-9]*' AND NOT EXISTS (
        SELECT 1 FROM customer_phone_lookup c WHERE c.restaurant_id=NEW.restaurant_id
        AND (c.digits=d OR c.digits='91'||d OR d='91'||c.digits)
    );

    UPDATE orders SET customer_id=(
        SELECT c.id FROM customer_phone_lookup c
        WHERE c.restaurant_id=NEW.restaurant_id AND length(c.digits)>=10 AND
            (d=c.digits OR d='91'||c.digits OR c.digits='91'||d)
        ORDER BY c.id LIMIT 1
    ) FROM (SELECT replace(replace(replace(replace(replace(trim(NEW.customer_phone_e164),' ',''),'-',''),'+',''),'(',''),')','') AS d)
    WHERE orders.id=NEW.id;

    UPDATE customers SET visit_count=(
        SELECT count(DISTINCT coalesce(nullif(o.seating_session_id,''),o.id))
        FROM orders o WHERE o.restaurant_id=customers.restaurant_id AND o.customer_id=customers.id
    ), updated_at=CURRENT_TIMESTAMP
    WHERE id=(SELECT customer_id FROM orders WHERE id=NEW.id);
END;

CREATE TRIGGER record_order_customer AFTER INSERT ON orders
WHEN NEW.customer_id IS NULL AND length(trim(NEW.customer_phone_e164)) > 0
BEGIN
    UPDATE orders SET customer_phone_e164=NEW.customer_phone_e164 WHERE id=NEW.id;
END;

-- Replay the same linking rules for tickets already on the till.
UPDATE orders SET customer_phone_e164=customer_phone_e164
WHERE customer_id IS NULL AND length(trim(customer_phone_e164)) > 0;
