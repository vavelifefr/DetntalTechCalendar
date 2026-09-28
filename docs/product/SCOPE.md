# Scope

## In scope

- Local web development version.
- Android application.
- Calendar-first UI.
- Order lifecycle; each Order is one Calendar record and the unit of accounting.
- Multiple distinct works (WorkItems) inside one Order; their progress is tracked individually, but they are not separate Calendar or accounting records.
- Odontogram.
- Pricing.
- Doctors directory and other configurable lookup/autofill data.
- Required-field configuration.
- Order closure and financial summary.
- Debts.
- Expenses and cancelled-order losses.
- Archive.
- Flexible local search.
- Statistics.
- Database management.
- Export/import.
- Deterministic test database.
- Automated tests and QA agent workflow.
- Optional local Android deadline reminders, enabled by the user in Settings.

## Out of scope unless explicitly added later

- Mandatory cloud sync.
- Multi-user realtime collaboration.
- Online accounts.
- Remote SQL server.
- Patient medical records.
- Full clinical chart.
- Insurance billing.
- Automatic external messaging.
- Android permissions unrelated to agreed product functions.

## Future-compatible but not yet specified

- Advanced debt settlement workflow.
- Advanced Pricing rules.
- Additional WorkItem fields.
- Additional odontogram semantics such as tooth surfaces.

## Explicitly excluded from current reminder behavior

- Sending reminder data to a remote service.
- Restoring reminders from a boot receiver. After a phone restart, the application rebuilds schedules when opened.
