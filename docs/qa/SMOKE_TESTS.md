# Smoke Tests — Current Application Behavior

IDs are stable regression scenario IDs. The current Playwright smoke suite covers a subset; see `tests/e2e/` for executable scenarios.

## S0 — Foundation

### SMOKE-S0-001
Start the local web application using `npm run dev`.

### SMOKE-S0-002
Verify local API health and that SQLite reports the current schema version.

### SMOKE-S0-003
Open a fresh isolated database and verify migrations reach schema version 10.

### SMOKE-S0-004
Run the database tooling test against a disposable temporary path and verify deterministic seed results. Do not reset the working `.local` database during smoke tests.

## Calendar and navigation

### SMOKE-CAL-001
Calendar opens as the home screen; today's operating-system date is marked green.

### SMOKE-CAL-002
With no selected date, hide the New Order button and show the interactive list of all open Orders or its empty state.

### SMOKE-CAL-003
Selecting a date shows `Новый заказ к : <date>`. Selecting that same date again clears it and hides the action.

### SMOKE-CAL-004
With a selected date, show only open Orders due on that exact day; if none are due, hide the selected-date list and totals frame.

### SMOKE-CAL-005
The selected-date Order totals equal the displayed count, provisional income, expenses, and income minus expenses.

### SMOKE-CAL-006
An open Order due today or earlier marks its deadline red. Closed Orders do not create Calendar deadline marks. No separate `Ближайший заказ` action is present.

### SMOKE-NAV-001
The menu contains Archive, Statistics, Debts, Pricing, Settings, and About; it does not contain Calendar. Other sections return home with `Домой`.

## Order and WorkItem

### SMOKE-ORD-001
Create an Order from a selected Calendar date. Verify the date pre-fills the editable deadline and the start date defaults to today.

### SMOKE-ORD-002
Required-field, date, minimum-one-WorkItem, and FDI validation prevent invalid saves.

### SMOKE-ORD-003
A new Order starts with zero saved WorkItems and a collapsed WorkItem area. `Добавить работу` opens the editor; save collapses the card.

### SMOKE-ORD-004
Pricing metadata controls numbering and color fields. FDI map and manual entry store identical comma-separated permanent tooth codes. A per-unit item without numbering shows quantity starting at one.

### SMOKE-ORD-005
Calculated Pricing is a temporary hint. The accepted WorkItem amount is saved; changing Pricing later does not rewrite that saved value.

### SMOKE-ORD-006
WorkItem cards are blue/green/red for in-progress/completed/cancelled. In an open Order the two actions offer statuses other than the current status, save immediately, and refresh counters and provisional totals.

### SMOKE-ORD-007
Completing the last in-progress WorkItem prompts to open closure. Accepting opens the common closure form; declining leaves the Order open.

### SMOKE-ORD-008
Cancelled WorkItems remain visible and counted separately but affect neither work subtotals nor provisional balance or closure expected amount.

### SMOKE-ORD-009
Editing Order details never changes its generated ID. Existing WorkItems and expense cards are collapsed by default; `Отмена` discards unsaved WorkItem edits.

## Expenses and closure

### SMOKE-EXP-001
Add, edit, and remove multiple expense cards. Save category/name, unit price, quantity, total, and optional comment as a snapshot; verify total equals unit price multiplied by quantity.

### SMOKE-CLS-001
Do not allow Order closure while any WorkItem is still in progress. Cancelled WorkItems are allowed.

### SMOKE-CLS-002
The common closure form defaults receipt to the sum of completed WorkItem accepted amounts. Underpayment without checking the debt box closes normally with no debt.

### SMOKE-CLS-003
When receipt is below expected, checking `Оформить как заказ с долгом` reveals editable debt defaulted to expected minus receipt. A receipt at or above expected cannot be closed with debt.

### SMOKE-CLS-004
Closure date may be historical but cannot precede the Order start date. Accepting correction sets it to the start date; declining returns to editing.

### SMOKE-FIN-001
Income equals closure receipt plus debt repayments. Balance equals income minus expenses. Outstanding debt is a separate metric and is never subtracted from balance.

### SMOKE-FIN-002
Full/partial repayments increase income and balance by the amount received and reduce outstanding debt. Forgiveness retains payment history and income while setting outstanding debt to zero.

### SMOKE-FIN-003
Existing/imported cancelled Orders contribute zero income, retain their expenses, remain in Archive, and enter Statistics only when a business closure date exists. The web UI does not expose Order cancellation.

## Archive and Statistics

### SMOKE-ARC-001
Archive results appear only after `Поиск`; compact cards show patient, Doctor, and numeric closure date, without Order ID.

### SMOKE-ARC-002
Opening an Archive result shows saved details and allows editing. Current Pricing is not used to rewrite historical values.

### SMOKE-ARC-003
Single-Order deletion requires confirmation and removes all linked work, expense, debt, payment, and financial records.

### SMOKE-ARC-004
`Удалить все заказы` requires the exact text `Удалить` and a second confirmation. It deletes all Orders and linked records while preserving Pricing, directories, and Settings.

### SMOKE-STA-001
Statistics groups by business closure date. After edits, stored aggregate values remain until `Обновить и пересчитать` is pressed.

### SMOKE-STA-002
A Doctor with outstanding debt has a red outline; selecting the Doctor opens Archive with that Doctor selected in the filter.

## Settings, JSON, and Android

### SMOKE-DBM-001
Export the full active SQLite database as versioned JSON.

### SMOKE-DBM-002
Reject incompatible or corrupt JSON without partially changing the active database.

### SMOKE-DBM-003
Selective Doctor/Color import replaces only those directory lists. Pricing import replaces Work and Expense categories together. Full restore replaces all data after validation.

### SMOKE-DBM-004
Restore supported historical backup formats and verify migration to the current schema without unintended financial recalculation.

### SMOKE-AND-001
On a physical phone, verify reminders are disabled by default and permission prompts appear only after enabling them.

### SMOKE-AND-002
Verify configured daily reminders include patient, Doctor, and deadline; after a phone restart, reopening the app rebuilds the schedule. No emulator or boot receiver is required.
