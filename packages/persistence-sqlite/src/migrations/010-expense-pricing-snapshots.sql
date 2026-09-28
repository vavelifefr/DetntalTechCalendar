CREATE TABLE expense_pricing_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  unit_price REAL CHECK (unit_price IS NULL OR unit_price >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL
);

INSERT INTO expense_pricing_items (id, name, unit_price, active, updated_at)
SELECT id, name, NULL, active, updated_at
FROM expense_categories;

ALTER TABLE order_expenses ADD COLUMN pricing_item_id TEXT;
ALTER TABLE order_expenses ADD COLUMN name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE order_expenses ADD COLUMN unit_price_snapshot REAL NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0);
ALTER TABLE order_expenses ADD COLUMN quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0);

UPDATE order_expenses
SET name_snapshot = COALESCE(NULLIF(trim(category), ''), 'Расход'),
    unit_price_snapshot = amount,
    quantity = 1;

DROP TABLE expense_categories;

PRAGMA user_version = 10;
