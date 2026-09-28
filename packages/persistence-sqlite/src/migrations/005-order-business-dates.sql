ALTER TABLE orders RENAME COLUMN created_at TO order_date;

UPDATE orders
SET order_date = substr(order_date, 1, 10);

ALTER TABLE orders ADD COLUMN closure_date TEXT;

PRAGMA user_version = 5;
