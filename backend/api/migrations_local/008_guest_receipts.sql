CREATE TABLE guest_order_receipts (
    request_id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
    received_at timestamptz
);
CREATE INDEX guest_orders_waiting ON guest_order_receipts(order_id) WHERE received_at IS NULL;
