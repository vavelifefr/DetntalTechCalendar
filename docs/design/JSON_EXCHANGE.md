# JSON import/export format

## Purpose

The application keeps one active local SQLite database. JSON files are portable copies used for moving selected data or restoring a full database; an imported file is not attached as a second live data source.

All exchange files use UTF-8 JSON and identify the application format, dataset, and format version.

## Dataset types

### Shared directory

`dataset` is `directory`; `doctors` and `colors` contain the reference lists. Import replaces both lists in the active database as one transaction. Existing expense positions and all saved order snapshots remain unchanged. Older directory files may include `expenseCategories`; that legacy field is ignored.

### Legacy Doctor directory

`dataset` is `doctor-directory`; `doctors` contains records with stable `id`, `firstName`, `lastName`, `phone`, `comment`, and `active` fields.

### Pricing

`dataset` is `pricing`; `items` contains both Work and Expense positions with stable `id`, `itemType`, `name`, `active`, and optional `metadata`. Work positions retain their supported calculation modes and prices. Expense positions use a per-unit price, which may be unset, and are available only in the Order expense editor. New exports include `pricingVersion: 2`. Replacing a version 2 Pricing file replaces both categories; importing an older Pricing file without the version marker replaces Work positions and preserves expense positions. Amounts are plain numbers. New exports omit currency metadata; imports ignore the legacy `currencyCode` field when present.

### Full database

`dataset` is `full-database`; `schemaVersion` identifies the database schema, and `database` contains all application records needed for restore, including directories, Work and Expense Pricing positions, Orders, WorkItems, financial records, tooth selections, and settings. New exports use schema version 10. The full database stores the single editable Order acceptance date as `order_date`, the optional business closure date as `closure_date`, WorkItem accepted amounts as `accepted_amount`, selected FDI codes as comma-separated `tooth_codes` text, and Order expense name, unit price, quantity, and total snapshots. Calculated Work Pricing hints are not stored; legacy `unit_price_snapshot` and `total_price_snapshot` columns, where present for compatibility, are exported as null. Order expenses, debts, and individual debt repayments are exported as `orderExpenses`, `orderDebts`, and `orderDebtPayments`; legacy aggregate financial snapshots remain included. New exports omit legacy currency metadata; restore accepts older currency fields and ignores them. Versions 2–10 are importable: versions 2–3 convert the legacy `workItemTeeth` relation into tooth text; versions 2–4 convert legacy Order `created_at` to the date portion of `order_date`; versions 2–5 initialize accepted amounts from `total_price_snapshot` and create legacy expense/debt rows from aggregate snapshots; versions 7–9 convert expense categories into Expense Pricing positions with no unit price and preserve old expenses as unit-price × 1 snapshots; version 9 also validates debt-payment entries against their linked debt. Version 2 has no tooth selections, so its WorkItem quantities are preserved without inferred teeth. Older exports can have a null `closure_date` for closed Orders whose historical business closure date was not recorded.

## Import behavior

- Before changing stored data, validate the JSON shape, supported format version, schema compatibility, record IDs, required values, and internal references.
- A shared-directory import replaces Doctors and Colors in the active SQLite database. Legacy `doctor-directory` imports replace only Doctors.
- A Pricing version 2 import replaces Work and Expense positions together. An older Pricing import replaces Work positions and leaves the Expense category intact.
- Selective imports run as a single transaction. Orders and unrelated datasets are preserved; invalid input leaves the database unchanged.
- A full-database restore replaces all application data in the active database. Show a clear confirmation before applying it.
- Exporting never changes active data. Imports copy data into SQLite; the selected JSON file is not kept as a live connection.

## Demo fixtures

`database/fixtures/doctors.demo.json` and `database/fixtures/pricing.demo.json` use synthetic values for development/testing. Demo price values are placeholders, not a real tariff.
