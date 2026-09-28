# Business Rules

These are invariants, not UI suggestions.

The current application behavior is the baseline for this document. It was reconciled with the web implementation and schema version 10 on 2026-09-26. Historical prompts are not normative; future intentional changes must update these rules and their regression checks before implementation.

## Calendar

### BR-CAL-001

The Calendar's unfiltered list contains all open Orders. When a date is selected, the list contains only open Orders whose common deadline is exactly that date. Calendar lists do not include an Order because a date falls within its start-to-closure interval. Before closure, the Calendar's informational balance is the sum of accepted amounts for non-cancelled WorkItems minus saved expenses. This is a provisional estimate, not realized income; open Orders have no debt and do not enter Archive or main Statistics.

### BR-CAL-002

The Calendar derives today's local date from the operating system and highlights it green. A deadline date with one or more open Orders due today or earlier is highlighted red; closed or cancelled Orders do not cause red highlighting. If today also has an open Order due that day, the date cell is red and today's number keeps its green marker.

## Order identity

An Order is the top-level Calendar record and the unit of accounting. A WorkItem is one named fabrication type or service inside that Order. There may be several WorkItems in one Order, but an individual WorkItem is not a separate Order or accounting unit.

### BR-ORD-001
Every Order has one immutable internal ID.

### BR-ORD-002
Patient label, Doctor, deadline and WorkItems are mutable attributes and must never be used as the sole persistent identity of an Order.

### BR-ORD-003
An Order has at most one common deadline shared by its WorkItems. The default required-field configuration requires it before save.

### BR-ORD-004
Adding/removing/editing WorkItems does not create a new Order unless the user explicitly creates a new Order.

### BR-ORD-005
The editable `Старт заказа` value is the sole Order acceptance/start date. It defaults to today; a separate Order `created_at` date is not stored.

Existing Order `created_at` values must be preserved as `Старт заказа` during migration. If the deadline is earlier than the start date, offer to set the deadline to the start date. Accepting applies the correction; declining returns to editing without saving. The invalid pair cannot be saved unchanged. Other historical dates are allowed.

### BR-ORD-006
Only an explicit user action closes an Order. Reaching the deadline or completing all WorkItems does not close it automatically.

### BR-ORD-007
At manual closure, the user enters the Order's business closure date. A past date is allowed, but it cannot precede `Старт заказа`. Statistics periods use this closure date; the technical archive-transition timestamp is separate.

### BR-ORD-008
Order card and WorkItem data remain editable after closure, including the business closure date. Editing cannot change the Order ID or lifecycle status. A closed Order's saved edits affect Archive immediately and Statistics only after explicit recalculation. Archive's current expected amount is derived from currently completed WorkItems; current expenses are derived from saved OrderExpense rows. Realized income remains the saved closure receipt plus debt repayments. For a closed or cancelled Order, WorkItem status and production dates may be corrected; completed items require a completion date, cancelled items require a cancellation date, and active items have neither terminal date.

### BR-ORD-009
Explicitly deleting an Order from its editor or expanded Archive result permanently removes that Order and its dependent WorkItems, tooth selections, expenses, debt, debt payments, and financial snapshot from the local database. The web interface offers no action to cancel an Order. Existing `CANCELLED` records remain supported for data compatibility.

### BR-ORD-010
Bulk deletion from Archive removes all Orders of every status and all Order-linked WorkItems, expenses, debt repayments, debt records, and financial snapshots atomically. It preserves Pricing, Doctors, Colors, and other non-Order settings. The action requires the exact typed confirmation `Удалить` followed by a separate confirmation; canceling either step leaves all data unchanged.

## WorkItems

### BR-WI-001
WorkItem status is independent from Order closure.

### BR-WI-002
Completing/cancelling the last active WorkItem must not silently close the Order.

### BR-WI-003
An active Order may receive new WorkItems after some earlier WorkItems are already completed/cancelled.

### BR-WI-004
For tooth-count work types, unit count is derived from the selected or manually entered permanent FDI tooth codes.

### BR-WI-005
For FDI and manual-number WorkItems, permanent tooth codes are stored as comma-separated text on the WorkItem, for example `11,13,28`. Codes are validated, duplicates are prevented, and `units` equals the number of stored codes. Reading the text restores the corresponding map selection. Manual entry uses the same validation and persistence path as map selection.

### BR-WI-006

A unique WorkItem has no Pricing item. Its name and accepted amount are entered manually; Pricing, tooth selection, and quantity do not determine its amount. Its accepted amount is included in Order income like the accepted amount of any other WorkItem.

### BR-WI-007

In an active Order, a WorkItem may transition to any of the other two statuses. Reopening a completed or cancelled WorkItem clears its completion/cancellation dates and preserves its start date. Selecting a terminal status records the current date for that status and clears the opposite terminal date. The status counts and provisional Order/Calendar summaries update after each transition; the Order remains open.

## Pricing

### BR-PRI-001
Pricing is a suggestion/calculation source for new WorkItems and WorkItems in active Orders.

### BR-PRI-002
Archived values must never be dynamically read from current Pricing.

### BR-PRI-003
Changing Pricing affects calculations shown in open forms. It never changes a saved accepted WorkItem amount or historical financial totals.

## Accounting

### BR-FIN-001
Final accounting is at Order level.

### BR-FIN-002
Intermediate WorkItem completion does not create final accounting entries.

### BR-FIN-003
Final accounting values are confirmed at Order closure.

### BR-FIN-004
Pricing and quantity produce a temporary calculated amount shown in the open form and used to prefill the editable accepted amount. The calculated amount is not stored. WorkItem accepted amounts remain saved for the historical work breakdown. At Order closure, the expected amount is the sum of accepted amounts for WorkItems with status `COMPLETED`; WorkItem amounts do not directly determine realized income or balance. Accepting the close-order suggestion after the last active WorkItem is completed opens the common closure form. The debt checkbox is available only when received is below expected. Leaving it unchecked closes normally with the actual received amount and zero debt; selecting it opens an editable debt amount defaulted to expected minus received.

### BR-FIN-005
Selecting `Оформить как заказ с долгом` in the common closure form records the amount received, expected amount, and an editable outstanding-debt entry linked to the Order. The default debt is expected amount minus received amount; the user may edit it before closure. Debt is not subtracted from balance. Each later debt payment is stored as a separate OrderDebtPayment entry and contributes to income and balance. If the checkbox is not selected, no debt is created, even when received is below expected.

### BR-FIN-006
A closed Order may have non-zero debt. It may also have received income below expected and zero debt when the user left the debt checkbox unchecked, for example after a discount or personal agreement.

### BR-FIN-007
An existing `CANCELLED` Order may have zero debt and non-zero expenses; the web interface does not create new cancelled Orders.

### BR-FIN-008
An existing or imported `CANCELLED` Order remains available in Archive. Its income is treated as zero, while its saved expenses remain included and can produce a negative financial result. Statistics includes it when it has a business `closure_date`.

### BR-FIN-009
An Order may contain multiple expense entries. Each entry stores the chosen expense name, unit price, quantity, calculated total, and optional comment as snapshots. The total is the rounded product of unit price and quantity; it remains unchanged when the Pricing position is later edited or deleted. Only the saved total affects expenses and balance.

### BR-FIN-010
Realized Order income is the amount received at closure plus the sum of recorded debt payments. The Order balance is realized income minus expenses; outstanding debt is stored and reported separately and is not subtracted. Expenses are the sum of OrderExpense entries. At debt closure, debt defaults to expected amount minus received amount and remains editable. If received amount is equal to or greater than expected amount, the Order cannot be closed with debt. Before closure, every WorkItem still in `ACTIVE` status must be marked completed or deleted; cancelled WorkItems are excluded from the expected amount.

Example: expected amount 20,000, received at closure 10,000, expenses 5,000, outstanding debt 10,000: income is 10,000 and balance is 5,000. If 4,000 of debt is later repaid, income becomes 14,000, balance becomes 9,000, and outstanding debt becomes 6,000.

When the user forgives the remaining debt, reduce the debt amount to the sum of saved repayments (or zero if there are none), preserving every repayment as income. Do not change the Order's realized income or balance; the outstanding debt becomes zero, the Order remains closed with closure type `WITH_DEBT`, and the debt no longer appears as outstanding. Because a debt ledger row must have a positive amount, forgiveness with no repayments removes that row and stores zero in the Order financial snapshot; with repayments, the row is reduced to their sum.

Before closing an Order, forgiving its debt, or recording a full or partial repayment, persist valid pending Order-card edits. If an editor is open, validation fails, or persistence fails, the financial action must not proceed. This persistence keeps the user on the Order card.

### BR-FIN-011
Open Order totals are informational and excluded from Archive and main Statistics. Closing the Order requires explicit user action; only then are its final financial values counted.

### BR-FIN-012
After closure, the user may edit Order card and WorkItem data. Accepted WorkItem amounts remain editable and are preserved when current Pricing changes, but they are historical work details and do not change received income or balance. Calculated amounts are shown only while an Order form is open and are never stored or used in Archive, Statistics, or balance calculations.

### BR-FIN-013
Statistics recalculates selected aggregates from stored closed-Order values when the user chooses `Обновить и пересчитать`. Period inclusion is based on the Order's business closure date and includes `CANCELLED` Orders with that date. A `CANCELLED` Order contributes zero income; its saved expenses remain in the total. Other Orders contribute the closure receipt and all recorded debt payments to income. Balance is income minus expenses, while outstanding debt is a separate metric.

### BR-FIN-014
Cancelled WorkItems remain stored and visible as informational history. Their accepted amounts are excluded from work-income subtotals and provisional Order balances, and they do not contribute to closure expected amounts or work-based Statistics aggregates. A closed Order's realized income remains its recorded closure receipt plus debt repayments; changing WorkItem status does not silently rewrite money actually received.

## Archive

### BR-ARC-001
Archive is historical data, not a live projection of current Pricing/settings.

### BR-ARC-002
Explicitly closing an Order preserves its final financial values. Orders with status `CANCELLED` are also Archive entries. Open Orders are not Archive entries.

### BR-ARC-003
Archive loads matching records only after the user submits `Поиск` with the current filter settings. Collapsed results show only patient name, Doctor, and numeric closure date in `дд.мм.гггг` format; Order ID is hidden on these cards. Selecting a result expands its saved details and provides access to the Order editing screen. Archive does not show an aggregate summary at the bottom.

## Data

### BR-DATA-001
Calendar, Active Orders, Archive, Debts and Statistics operate over the same underlying local database.

### BR-DATA-002
Do not duplicate authoritative Order data into independent per-screen stores.

### BR-DATA-003
Schema changes require explicit migrations.

### BR-DATA-004
Application screens use platform-independent application interfaces. Screen code must not access Fastify routes or platform-specific persistence APIs directly.

### BR-DATA-005
On Android, core data operations use the device-local SQLite database and do not depend on Fastify, internet access, cloud services, or an external database server.

## Configuration

### BR-CFG-001
Required-field rules are user-configurable.

### BR-CFG-002
A missing configured required field blocks Order save/create.

## Security/locality

### BR-SEC-001
Core application functionality must work without cloud services.

### BR-SEC-002
Do not add Android permissions unless required by an approved feature and explicitly approved by the user.

### BR-SEC-003
Android due reminders are local notifications. Patient and Doctor names may be shown on the lock screen when the user enables reminders. Do not send reminder data to a network service.
