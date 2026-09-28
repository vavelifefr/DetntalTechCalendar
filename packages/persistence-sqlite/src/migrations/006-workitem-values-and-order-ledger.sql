ALTER TABLE work_items ADD COLUMN accepted_amount REAL CHECK (accepted_amount IS NULL OR accepted_amount >= 0);

UPDATE work_items
SET accepted_amount = total_price_snapshot;

CREATE TABLE order_expenses (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  comment TEXT
);

CREATE INDEX order_expenses_order_idx ON order_expenses(order_id, id);

CREATE TABLE order_debts (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  comment TEXT
);

INSERT INTO order_expenses (id, order_id, amount, comment)
SELECT lower(hex(randomblob(16))), order_id, expenses, NULL
FROM order_financials
WHERE expenses > 0;

INSERT INTO order_debts (id, order_id, amount, comment)
SELECT lower(hex(randomblob(16))), order_id, debt, NULL
FROM order_financials
WHERE debt > 0;

PRAGMA user_version = 6;
