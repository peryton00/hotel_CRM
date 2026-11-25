CREATE TABLE split_item_allocations(
 split_bill_id TEXT NOT NULL REFERENCES split_bills(id),order_item_id TEXT NOT NULL REFERENCES order_items(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(split_bill_id,order_item_id)
);
