CREATE TABLE activity_history (
    id INTEGER PRIMARY KEY,
    restaurant_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    actor_id TEXT,
    actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
    actor_label TEXT,
    timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX activity_by_restaurant ON activity_history(restaurant_id,id DESC);

CREATE TRIGGER audit_order_status AFTER UPDATE OF status ON orders WHEN OLD.status <> NEW.status BEGIN
    INSERT INTO activity_history(restaurant_id,action,entity_type,entity_id,notes)
    VALUES(NEW.restaurant_id,'ORDER_STATUS_CHANGED','ORDER',NEW.id,coalesce(NEW.order_number,NEW.id) || ': ' || OLD.status || ' to ' || NEW.status);
END;
CREATE TRIGGER audit_payment AFTER INSERT ON payments BEGIN
    INSERT INTO activity_history(restaurant_id,action,entity_type,entity_id,notes)
    VALUES(NEW.restaurant_id,'PAYMENT_RECORDED','PAYMENT',NEW.id,printf('Order %s / %s / %.2f INR / %s',NEW.order_id,NEW.payment_method,NEW.amount_paise/100.0,NEW.status));
END;
CREATE TRIGGER audit_refund AFTER UPDATE OF status ON refunds WHEN OLD.status <> NEW.status BEGIN
    INSERT INTO activity_history(restaurant_id,action,entity_type,entity_id,notes,actor_id)
    VALUES(NEW.restaurant_id,'REFUND_STATUS_CHANGED','REFUND',NEW.id,printf('Order %s / %.2f INR / %s to %s',NEW.order_id,NEW.refund_amount_paise/100.0,OLD.status,NEW.status),NEW.processed_by_staff_id);
END;
CREATE TRIGGER audit_guest_order AFTER INSERT ON sync_inbox WHEN NEW.event_type='ORDER_CREATED' BEGIN
    INSERT INTO activity_history(restaurant_id,action,entity_type,entity_id,notes,actor_role,actor_label)
    SELECT o.restaurant_id,'ORDER_CREATED','ORDER',o.id,printf('%s / Table %s / %.2f INR / received by desktop',o.order_number,coalesce(t.number,'unknown'),o.total_amount_paise/100.0),'CUSTOMER','Customer website'
    FROM orders o LEFT JOIN tables t ON t.id=o.table_id WHERE o.id=NEW.aggregate_id;
END;
