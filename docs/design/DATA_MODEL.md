# Data Model

This describes the target logical model. The persisted SQLite schema is version 10; migration 004 stores FDI tooth codes directly on WorkItems, migration 005 replaces the Order creation timestamp with one editable acceptance date and adds a business closure date, migration 006 adds accepted WorkItem amounts plus separate OrderExpense and OrderDebt records, migration 007 adds the Color and expense-category directories, migration 008 clears legacy calculated-price snapshots, migration 009 adds separate debt-payment entries, and migration 010 moves expense categories into Pricing and adds OrderExpense snapshots for item, unit price, quantity, and total. WorkItem production status actions, normal/debt closure, Archive/Debts views, Statistics by business closure date, permanent Order deletion, and post-closure financial editing are implemented. The web interface no longer offers Order cancellation; existing cancelled records remain supported. The accepted amount and financial snapshots remain authoritative; current Pricing values are only form suggestions.

Android reminder preferences use the existing `app_settings` key/value table; no schema migration is required. The settings are `android_order_reminders_enabled`, `android_order_reminders_lead_days`, and `android_order_reminders_time`. Native scheduled alarm data is a rebuildable cache, not authoritative Order data.

## Core identity rule

`Order.id` is the only persistent Order identity.

Do not derive identity from patient + Doctor + date because all of those may change.

---

## Order

Order is the user-visible top-level record, one Calendar item by its common deadline, and the unit of accounting. It contains one or more WorkItems.

Persisted fields:

```text
Order
- id: UUID / immutable
- patient_label: nullable text; required by default in Settings
- doctor_id: nullable FK -> Doctor
- order_date: required date; editable; UI label `Старт заказа`
- updated_at
- deadline_at: nullable timestamp; required by default in Settings
- closure_date: nullable date; entered during explicit closure; used for Statistics periods
- status: ACTIVE | CLOSED | CANCELLED
- closure_type: nullable `NORMAL | WITH_DEBT | CANCELLED`
- general_comment: nullable
- archived_at: nullable timestamp; technical time of transition to Archive, set only after explicit user closure
```

Notes:
- exactly one editable Order acceptance/start date and one common deadline;
- the Order does not store a separate `created_at` date;
- `closure_date` cannot precede `order_date`; it is distinct from the technical `archived_at` timestamp;
- Order card and WorkItem data may be edited after closure, including `closure_date`; editing never changes the Order `id` or lifecycle `status`;
- if `deadline_at` is earlier than `order_date`, saving requires accepting the one-day correction (`deadline_at = order_date`); declining returns to editing;
- migration copies legacy Order `created_at` values into `order_date` before removing the old field;
- patient is a label, not a full patient record;
- Doctor may change without changing Order ID.
- Permanent Order deletion cascades to its WorkItems, WorkItem tooth selections, OrderExpense rows, OrderDebt row and repayment rows, and OrderFinancial snapshot. The Archive bulk-delete operation removes all Orders in one transaction and preserves Pricing and directories. Cancellation is a separate lifecycle action and retains the Order's historical data.

---

## WorkItem

WorkItem is one specific type of fabrication or service inside an Order (the Russian UI term is «работа»). It may have its own production status and history dates, but it is not a separate Calendar item or accounting unit.

```text
WorkItem
- id
- order_id
- pricing_item_id: nullable FK -> PricingItem
- work_type_snapshot: required text
- status: ACTIVE | COMPLETED | CANCELLED
- unit_mode: TOOTH_COUNT | FIXED | OTHER
- units
- accepted_amount: nullable number; user-confirmed amount used for income
- tooth_codes: nullable comma-separated FDI text, e.g. `11,13,28`
- shade
- comment
- started_at: nullable timestamp
- completed_at: nullable timestamp
- cancelled_at: nullable timestamp
- created_at
- updated_at
```

The current calculated amount is read from Pricing and quantity while the form is open. It prefills the editable `accepted_amount`, but is not persisted. The accepted amount is retained as the historical price of each WorkItem. At closure, `final_total` stores the expected amount: the sum of accepted amounts for WorkItems with status `COMPLETED`. WorkItem amounts do not directly determine realized income or balance. The legacy nullable SQLite columns `unit_price_snapshot` and `total_price_snapshot` remain empty for exchange compatibility; migration 008 clears old values and application writes keep them null.

When a Pricing item has numbering disabled, a `PER_UNIT` WorkItem uses `units` as an ordinary positive whole-number quantity and has no tooth selection. When numbering is enabled, FDI selections determine `units`. Cancelled WorkItems remain distinct from completed WorkItems in the editor summary.

A unique WorkItem has `pricing_item_id = null`, a manually entered `work_type_snapshot`, and a manually entered `accepted_amount`. It does not use tooth selection or quantity-based calculation. Its accepted amount contributes to work-based subtotals only while the WorkItem is not cancelled; only completed WorkItems contribute to the closure expected amount. A cancelled WorkItem remains stored for information.

A single Order may contain many WorkItems.
Production dates are historical data for Archive filters/statistics. They do not create Calendar markers. No uniqueness constraint is placed on these dates: multiple WorkItems may start or finish on the same date.
For an ACTIVE Order, WorkItem status can transition between any of `ACTIVE`, `COMPLETED`, and `CANCELLED`. Changing a terminal WorkItem back to `ACTIVE` clears `completed_at` and `cancelled_at` while preserving `started_at`. Selecting `COMPLETED` or `CANCELLED` records the current timestamp in the matching field and clears the other terminal timestamp. Closed/cancelled Orders retain their editable status/date form; the quick status actions apply only to ACTIVE Orders.

---

FDI tooth codes are stored directly in `WorkItem.tooth_codes` as comma-separated text. The application validates each code against the permanent FDI set, restores the map selection by parsing the text, and sets `WorkItem.units` to the number of stored codes. The map and manual-entry modes share the same storage format.

Migration 004 converts existing `WorkItemTooth` rows into comma-separated text per WorkItem before removing the relation table. Schema version 4 has no tooth relation table.

Only permanent teeth are included in the first release. Milk teeth may be added as an optional post-release feature. Historical S2 WorkItems are preserved without inventing tooth selections during migration; their existing unit values remain unchanged until edited.

---

## Doctor

```text
Doctor
- id
- first_name
- last_name
- phone
- comment
- active
```

Used by:
- Order autofill;
- filtering;
- debt views;
- statistics.

---

## PricingItem

```text
PricingItem
- id
- item_type: WORK or EXPENSE
- name
- calculation_mode
- unit_price
- fixed_price
- active
- metadata
- updated_at
```

Schema version 10 still has legacy `currency_code` columns. Current application logic ignores them; amounts have no currency and are displayed as plain numbers. New JSON exports omit these fields, and restores accept older files without relying on them.

Work entries are stored in `pricing_items`; expense entries are stored in `expense_pricing_items` and returned by the application as the same combined Pricing list. Expense entries use a per-unit price, which may be unset until entered. They never appear as WorkItem choices.

```text
ExpensePricingItem
- id
- name
- unit_price: nullable unit price
- active
- updated_at
```

Possible modes:
- PER_UNIT
- FIXED
- COMPOSITE / future extension

Pricing is mutable. Saved WorkItem names and accepted amounts remain snapshots. Current Pricing metadata may control which optional editor fields are shown, but current prices never recalculate saved accepted amounts.

`metadata.orderEditorFields` is an array of editor-field keys, currently `numbering` and `color`. It controls which matching controls appear for a standard WorkItem using that Pricing item; it does not change stored WorkItem values or accepted amounts. New Pricing items use an empty array by default. When the key is absent in legacy Pricing metadata, the editor preserves the previous behavior and shows both fields. Future configurable controls can add a key to this list and its editor field registry without changing SQLite schema.

Historical financial values do not read current Pricing dynamically.

---

## Order financial snapshot

While an Order is open, financial totals are informational and remain editable through its WorkItems and expense entries. On explicit user closure, store final authoritative values and include the Order in Archive and main Statistics.

```text
OrderExpense
- id
- order_id
- pricing_item_id: nullable reference to the current expense position
- name_snapshot
- unit_price_snapshot
- quantity
- amount: rounded total snapshot
- category: legacy text snapshot, retained for compatibility
- comment: nullable text
```

An Order may have multiple `OrderExpense` rows. The stored total is the unit price multiplied by quantity, rounded to two decimal places. The price, quantity, name, and total are snapshots; changing or deleting the Pricing position does not change saved expenses. Only `amount` is included in financial calculations. Migration 010 initializes old expense rows with their former amount as the unit-price snapshot and quantity 1, preserving each historical total.

## Shared directories

Doctors remain relational records because Orders may reference a Doctor. Colors remain a named directory. A color is copied as text into `WorkItem.shade`; an expense name is copied into `OrderExpense.name_snapshot`. The selective `directory` JSON file exports and replaces Doctors and Colors. Expense positions are included in Pricing JSON. Legacy directory imports may contain an `expenseCategories` array; it is ignored so a directory import cannot replace Pricing. Legacy `doctor-directory` imports remain supported.

```text
OrderDebt
- id
- order_id: unique FK -> Order
- amount: tracked debt amount; initially the amount recorded at closure
- comment: nullable text
```

The closure flow creates one separate debt record only when the user selects `Оформить как заказ с долгом`; an Order closed without that selection has no OrderDebt row, even if the received amount is below expected. Debt defaults to expected amount minus the amount received at closure and may be edited. Debt is not subtracted from the balance. The outstanding amount is the recorded debt amount minus its repayment entries, floored at zero. If the user forgives the remainder, the recorded debt amount is reduced to the sum of repayments (or zero if there are none); the repayment rows remain as income, and the Order stays closed with closure type `WITH_DEBT`.

```text
OrderDebtPayment
- id
- debt_id: FK -> OrderDebt
- amount: positive receipt
- received_at: ISO timestamp captured when the payment is recorded
```

Each partial or full debt payment is stored as its own `OrderDebtPayment` row. A payment cannot exceed the remaining debt. Deleting its Order cascades to the debt and all of its payment entries.

Migration 006 copies the existing aggregate debt amount into this record; a legacy debt has no comment. Future finance changes must continue preserving the legacy aggregate financial snapshots until the replacement workflow is complete.

```text
OrderFinancial
- order_id
- final_total: expected amount at closure, from completed WorkItems
- received_amount: actual amount received at closure
- expenses: closure-time sum of OrderExpense entries
- debt: current debt threshold from OrderDebt, initially recorded at closure
- financial_result: received_amount + sum(OrderDebtPayment.amount) - expenses
- currency_code: legacy compatibility data, ignored by current application logic
- confirmed_at
```

At closure, an Order must have no WorkItems left in `ACTIVE` status; they must be marked completed or removed. Cancelled WorkItems remain historical and are excluded from `final_total`. On cancellation, `final_total`, `received_amount`, and debt are zero while recorded expenses remain. Realized income is the amount received at closure plus all debt payments. Balance is realized income minus expenses; remaining debt is reported separately and does not reduce balance. After closure, Order card and WorkItem data remain editable from their stored rows, including the business closure date and WorkItem status/production dates. Editing never changes the Order ID or lifecycle status. Statistics refreshes expected totals and expenses from stored values while preserving closure receipts and debt-payment rows. Calculated Pricing hints are not persisted.

Derived amounts:

```text
Expected amount = sum(accepted_amount for completed WorkItems)
Order income = received_amount + sum(OrderDebtPayment.amount)
Archive expenses = sum(OrderExpense.amount)
Outstanding debt = max(OrderDebt.amount - sum(OrderDebtPayment.amount), 0)
Statistics = OrderFinancial snapshot until explicit recalculation
balance = income - expenses
```

The informational summary uses the expected work total minus expenses before closure. Archive includes Orders with status `CLOSED` or `CANCELLED`; the web interface does not offer an Order-cancellation action. Main Statistics includes these records when `closure_date` is present. For a `CANCELLED` Order, income is treated as zero while saved expenses remain included. Expanded Archive details preserve WorkItem prices as historical work information. Statistics period filters use `Order.closure_date`; `Обновить и пересчитать` refreshes expected totals and expenses without reading current Pricing, and preserves the closure receipt and every debt-payment row. For other closed Orders, income includes closure receipts and linked debt payments; debt is the current outstanding remainder.

Important:
- accounting is Order-level;
- WorkItems do not have separate payment balances.

---

## Debt payment history

Debt payment history is stored in `OrderDebtPayment` rather than folded into the Order's closure receipt. This preserves each partial receipt as income. Forgiving the remaining balance adjusts the tracked debt amount to the sum of its payment rows while keeping those rows unchanged.

---

## RequiredFieldSetting

```text
RequiredFieldSetting
- field_key
- required: boolean
```

The application must not hardcode one permanent mandatory-field set. `order_date` (`Старт заказа`) is always required; other supported fields use `RequiredFieldSetting`.

---

## AppSetting

The schema may retain `default_currency_code` in legacy databases. Current application behavior does not use a currency setting.

Additional application settings may be added when their behavior is specified.

---

## Import/export metadata

Use versioned JSON transport files for the Doctor directory, Pricing, and full database backup. The format is defined in `docs/design/JSON_EXCHANGE.md`. Each file identifies its dataset and format version; a full backup also carries the database schema version. A Pricing file contains plain numeric amounts without currency metadata.

Importing a directory or Pricing file replaces only that dataset in the active SQLite database, atomically. Full backup restore replaces all active database contents after validation. Invalid files must not partially update the database.

---

## Current indexes

Schema version 10 currently includes:

- `orders(deadline_at, status)`
- `orders(doctor_id)`
- `orders(patient_label)`
- `orders(archived_at)`
- `work_items(order_id, status)`
- `work_items(work_type_snapshot)`
- `work_items(started_at)`
- `work_items(completed_at)`
- `work_items(cancelled_at)`
- `order_expenses(order_id, id)`
- `order_debt_payments(debt_id, received_at)`

Add search-driven composite indexes only when query requirements and tests justify them.
