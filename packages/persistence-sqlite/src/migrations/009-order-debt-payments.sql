CREATE TABLE order_debt_payments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES order_debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  received_at TEXT NOT NULL
);

CREATE INDEX order_debt_payments_debt_received_idx ON order_debt_payments(debt_id, received_at);

UPDATE order_financials
SET financial_result = received_amount - expenses;
