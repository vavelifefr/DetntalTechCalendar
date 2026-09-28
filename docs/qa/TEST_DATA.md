# Test Data and Database Isolation

## Principles

- All test names, people, and prices are synthetic.
- Test expectations come from fixed inputs and independently written expected values, not from production calculation helpers.
- Automated checks run in memory or disposable temporary databases. They must never reset or seed the active `.local` working database.

## Portable fixtures

```text
database/fixtures/
- doctors.demo.json      5 synthetic Doctors
- pricing.demo.json      20 Work Pricing entries with plain numeric amounts
- database.demo.json     historical full-database backup, schema version 9
```

The historical full-database fixture contains 5 Doctors, 5 Colors, 20 Work Pricing entries, 6 legacy expense categories, 30 Orders (20 `CLOSED`, 10 `ACTIVE`), and 40 WorkItems. Its `orderFinancials`, `orderExpenses`, `orderDebts`, and `orderDebtPayments` collections are empty. It is a compatibility/import fixture, not a financial-statistics oracle. Restoring it exercises migration into the current schema 10; the six legacy expense categories become Expense Pricing entries with no invented prices.

The schema-version-10 full export format and supported historical import versions are described in `docs/design/JSON_EXCHANGE.md`.

## Deterministic SQLite seed

`seedTestDatabase` uses a fixed date anchor of 2026-09-24 and creates 5 Doctors, 5 Colors, 20 Work Pricing entries, 6 Expense Pricing entries with unset unit prices, 20 closed Orders, 10 active Orders, and their synthetic WorkItems. It also includes repeated WorkItem production dates. The current seed totals are asserted by `packages/persistence-sqlite/src/test-database.test.ts`.

The npm commands `db:test:reset`, `db:test:seed`, and `db:test:export` operate on the configured default working database unless `DTC_DB_PATH` points elsewhere. Do not run them as part of routine QA. The active working database may contain separate current web-preview data; it is not the automatic Playwright dataset.

## Automated isolation

- Vitest product, migration, and API tests use SQLite in memory.
- The test-database tooling test uses and removes a disposable temporary directory.
- Playwright starts a separate API configured with `DTC_DB_PATH=:memory:` and a separate Vite server. E2E scenarios that mutate data export and restore a backup from that isolated API.
- Neither suite reads, seeds, resets, nor exports `.local/dental-tech-calendar.sqlite`.

## Canonical behaviors represented

- Calendar events belong to Orders and appear on their common deadline only.
- FDI selections are permanent tooth codes saved as comma-separated text; map and manual input produce the same stored values.
- WorkItem calculated amounts are transient hints. Accepted amounts are saved; expense name, unit cost, quantity, total, and comment are saved as snapshots.
- Only completed WorkItems contribute to expected closure amount. Cancelled WorkItems remain visible but are excluded from financial work subtotals.
- Realized income is closure receipt plus separate debt payments; expenses reduce balance; outstanding debt is a separate amount.
- Archived aggregate snapshots change only after explicit Statistics recalculation.
- Selective JSON import replaces only the selected dataset; full restore replaces all data after validation.

## Financial fixtures

Each financial scenario states its input and expected values in the relevant Vitest test. At minimum, retain explicit cases for:

- underpayment with no debt checkbox selected;
- closure with editable debt and a receipt below expected;
- partial/full debt payments and forgiveness;
- expense snapshots and post-closure edits;
- cancelled WorkItems excluded from totals;
- imported or historical cancelled Orders with retained expenses;
- Statistics before and after explicit recalculation.

For every search regression, state the filters and expected IDs/count. Do not use current `Pricing` to derive archived financial expectations.
