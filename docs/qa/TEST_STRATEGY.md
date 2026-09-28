# Test Strategy

## Authority

Regression checks describe verified current application behavior. During a canon-alignment task, if a check disagrees with the implementation, verify the source and UI first; then update the stale check and its documentation. Do not change application behavior just to satisfy an obsolete test. A deliberate future behavior change starts with an updated requirement and acceptance criteria.

## Automated layers

### Vitest — `npm test`

Runs the current unit, API, SQLite, migration, and adapter tests. There is no separate `test:integration` npm script: integration scenarios are included in the Vitest suite.

### Playwright — `npm run test:smoke`

Runs browser smoke scenarios in one Chromium worker. `playwright.config.ts` starts a dedicated local API on port 3001 with `DTC_DB_PATH=:memory:` and Vite on port 5174. These scenarios do not use or reset `.local/dental-tech-calendar.sqlite`.

### Typecheck and production build — `npm run build`

Runs TypeScript checking followed by the Vite production build.

## Database safety

- Unit and API tests use in-memory SQLite except the test-database tooling test, which uses a disposable OS temporary directory.
- Playwright uses an isolated in-memory database. Tests that change it restore their own full-database backup in cleanup.
- `npm run db:test:reset`, `npm run db:test:seed`, and `npm run db:test:export` target the default working database unless `DTC_DB_PATH` is overridden. Reset/seed are never part of automated QA because the default path is also used by the running web app.
- Never reset, seed, or export the active working database as a side effect of a test run. Use `:memory:` or a dedicated disposable path.
- Do not add a test-only reset endpoint to the production API. Prefer isolated database injection or a disposable DB path.

## What checks protect

1. Calendar selection, hidden/shown New Order action, exact-deadline filtering, and empty selected-date behavior.
2. Required Order validation, WorkItem/expense cards, FDI input, status changes, Order closure, and ID stability.
3. Receipt/debt/expense accounting: income is the closure receipt plus debt payments; balance is income minus expenses; unpaid debt is separate; cancelled WorkItems are informational only.
4. Historical independence: saved accepted amounts and expense snapshots do not read current Pricing; Statistics aggregates change only after explicit recalculation.
5. Archive search, exact saved values, single/all-Order deletion and linked-row cleanup.
6. JSON import/export compatibility and migration preservation through schema version 10.
7. Android source/build checks separately from physical-device permission and notification-delivery checks.

## Financial test oracles

Expected values must be stated independently of the implementation under test. Include at least:

- expected WorkItem amount, closure receipt, expense total, debt, repayments, and balance;
- a closed Order with an underpayment and no debt selected;
- a debt payment and forgiveness while preserving previously received income;
- cancelled WorkItems excluded from totals;
- a cancelled Order with zero income and retained expenses;
- a post-closure edit where Archive detail updates but Statistics changes only after recalculation.

For the example `expected 20,000`, `received 10,000`, `expenses 5,000`, and `debt 10,000`, realized income is 10,000 and balance is 5,000. If 4,000 of debt is later received, income is 14,000, balance is 9,000, and outstanding debt is 6,000.

Do not calculate the expected test value by calling the same production calculation helper being tested.

## Migration testing

For each numbered migration, create a database at the previous supported schema, insert representative rows, migrate, and verify schema, retained values, and key queries. Assert any intentional accounting conversion explicitly; migration 009, for example, normalizes the legacy realized balance to `received_amount - expenses` without subtracting debt. Full JSON backup compatibility is covered separately by restore tests.

## Android manual validation

Device checks require a physical Android handset and the built APK. Verify first launch shows the application directly without the browser-only POCO device preview, local persistence, importing a full-database JSON file from the Android file picker, confirmation that imported records replace the database, and a visible in-place error for invalid files. Also verify notification/exact-alarm prompts only after enabling reminders, notification contents and timing, and reminder rescheduling after Order edits. There is no requirement to use an emulator. A successful Gradle build is not evidence of device-level behavior.

## Failure report

For each reproducible failure, record:

```text
Test ID:
Related requirement:
Severity:
Environment:
Preconditions:
Steps:
Expected:
Actual:
Data/Order IDs:
Logs/errors:
Reproducible: yes/no
```

Severity: BLOCKER (startup/core workflow or corruption), HIGH (accounting/archive/debt/search), MEDIUM (feature with workaround), LOW (minor UI/UX).
