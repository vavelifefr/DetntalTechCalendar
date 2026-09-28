CREATE TABLE doctors (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  comment TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pricing_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  calculation_mode TEXT NOT NULL CHECK (calculation_mode IN ('PER_UNIT', 'FIXED', 'COMPOSITE')),
  unit_price REAL,
  fixed_price REAL,
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  CHECK (unit_price IS NULL OR unit_price >= 0),
  CHECK (fixed_price IS NULL OR fixed_price >= 0),
  CHECK (
    (calculation_mode = 'PER_UNIT' AND unit_price IS NOT NULL AND fixed_price IS NULL) OR
    (calculation_mode = 'FIXED' AND fixed_price IS NOT NULL AND unit_price IS NULL) OR
    (calculation_mode = 'COMPOSITE' AND (unit_price IS NOT NULL OR fixed_price IS NOT NULL))
  )
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  patient_label TEXT,
  doctor_id TEXT REFERENCES doctors(id) ON DELETE SET NULL,
  doctor_name_snapshot TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deadline_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'CLOSED', 'CANCELLED')),
  closure_type TEXT,
  general_comment TEXT,
  archived_at TEXT
);

CREATE INDEX orders_deadline_status_idx ON orders(deadline_at, status);
CREATE INDEX orders_doctor_idx ON orders(doctor_id);
CREATE INDEX orders_patient_label_idx ON orders(patient_label);
CREATE INDEX orders_archived_at_idx ON orders(archived_at);

CREATE TABLE work_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  pricing_item_id TEXT REFERENCES pricing_items(id) ON DELETE SET NULL,
  work_type_snapshot TEXT NOT NULL CHECK (length(trim(work_type_snapshot)) > 0),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  unit_mode TEXT NOT NULL CHECK (unit_mode IN ('TOOTH_COUNT', 'FIXED', 'OTHER')),
  units REAL NOT NULL DEFAULT 1 CHECK (units > 0),
  unit_price_snapshot REAL CHECK (unit_price_snapshot IS NULL OR unit_price_snapshot >= 0),
  total_price_snapshot REAL CHECK (total_price_snapshot IS NULL OR total_price_snapshot >= 0),
  shade TEXT,
  comment TEXT,
  started_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX work_items_order_status_idx ON work_items(order_id, status);
CREATE INDEX work_items_type_idx ON work_items(work_type_snapshot);
CREATE INDEX work_items_started_at_idx ON work_items(started_at);
CREATE INDEX work_items_completed_at_idx ON work_items(completed_at);
CREATE INDEX work_items_cancelled_at_idx ON work_items(cancelled_at);

CREATE TABLE order_financials (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  final_total REAL NOT NULL DEFAULT 0,
  received_amount REAL NOT NULL DEFAULT 0,
  expenses REAL NOT NULL DEFAULT 0,
  debt REAL NOT NULL DEFAULT 0,
  financial_result REAL NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  confirmed_at TEXT NOT NULL
);

CREATE TABLE required_field_settings (
  field_key TEXT PRIMARY KEY,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO required_field_settings (field_key, required, updated_at) VALUES
  ('patient_label', 1, '2026-09-24T00:00:00.000Z'),
  ('doctor_id', 1, '2026-09-24T00:00:00.000Z'),
  ('deadline_at', 1, '2026-09-24T00:00:00.000Z');

INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES
  ('new_order_date_default', 'today', '2026-09-24T00:00:00.000Z'),
  ('default_currency_code', 'RUB', '2026-09-24T00:00:00.000Z');

PRAGMA user_version = 2;
