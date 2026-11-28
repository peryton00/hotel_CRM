-- Spend follows posted tenders less completed refunds. Preserve manually awarded points.
CREATE VIEW customer_collections AS
SELECT o.customer_id, p.amount_paise AS amount FROM payments p
JOIN orders o ON o.id=p.order_id WHERE p.status='COMPLETED' AND o.customer_id IS NOT NULL
UNION ALL
SELECT o.customer_id, -r.refund_amount_paise FROM refunds r
JOIN orders o ON o.id=r.order_id WHERE r.status='completed' AND o.customer_id IS NOT NULL;

UPDATE customers SET total_spend_paise=COALESCE((SELECT SUM(amount) FROM customer_collections WHERE customer_id=customers.id),0);
UPDATE customers SET loyalty_points=loyalty_points+max(0,total_spend_paise)/1000;

CREATE TRIGGER customer_payment_posted AFTER INSERT ON payments WHEN NEW.status='COMPLETED'
BEGIN
 UPDATE customers SET loyalty_points=loyalty_points+(total_spend_paise+NEW.amount_paise)/1000-total_spend_paise/1000,
 total_spend_paise=total_spend_paise+NEW.amount_paise WHERE id=(SELECT customer_id FROM orders WHERE id=NEW.order_id);
END;
CREATE TRIGGER customer_refund_posted AFTER UPDATE OF status ON refunds WHEN NEW.status='completed' AND OLD.status!='completed'
BEGIN
 UPDATE customers SET loyalty_points=max(0,loyalty_points+max(0,total_spend_paise-NEW.refund_amount_paise)/1000-total_spend_paise/1000),
 total_spend_paise=max(0,total_spend_paise-NEW.refund_amount_paise) WHERE id=(SELECT customer_id FROM orders WHERE id=NEW.order_id);
END;
