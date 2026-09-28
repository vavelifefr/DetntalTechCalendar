# Roadmap — Implemented Slices and Validation

Updated: 2026-09-26

The current application behavior is the baseline for this roadmap. Earlier milestone descriptions are historical when they conflict with the implemented screens or rules. Do not reintroduce removed actions such as a Calendar menu entry, a nearest-Order button, or an Order-cancellation control.

## Delivered in the current web application

### S0 — Foundation

Implemented: React + TypeScript + Vite web client, local Node.js + Fastify API, SQLite persistence, migrations through schema version 10, shared application boundary, Vitest, Playwright, and deterministic in-memory browser smoke setup.

### S1 — Calendar and navigation

Implemented: Calendar home, local today marker, due/overdue styling for open Orders, selected-date New Order action, open-Order summaries, main navigation, and Home shortcut. No nearest-Order action exists.

### S2 — Order workflow

Implemented: shared Order card structure for creation and editing, immutable Order ID, patient and Doctor details, one editable acceptance date and common deadline, WorkItem cards, expense cards, required-field validation, deletion, and JSON database management. A new Order must contain at least one saved WorkItem.

### S3 — Odontogram

Implemented: permanent-tooth FDI map and manual FDI input, with both paths persisting the same tooth-code list. Milk teeth remain out of the current release scope.

### S4 — Pricing and directories

Implemented: separate Work and Expense Pricing categories, Doctor and Color directories, per-entry editor-field metadata, automatic price hints, and editable accepted amounts.

### S5 — Production workflow

Implemented: WorkItem status transitions and production dates, status-colored cards, status counts, and an optional prompt to open the common Order closure form after the last active WorkItem is completed. WorkItem completion never closes an Order by itself.

### S6 — Closure and archive transition

Implemented: one explicit closure form with editable receipt and an optional debt checkbox. Underpayment can close normally without debt; selecting the checkbox records a separate editable debt amount. The web interface has no action to cancel an Order. Existing/imported cancelled Orders remain supported for history.

### S7 — Accounting and Debts

Implemented: closure receipts, linked debt rows, separate debt-payment rows, debt forgiveness, and balance calculation. Realized income is the closure receipt plus paid debt installments; balance is realized income minus saved expenses; outstanding debt is separate and does not reduce balance.

### S8 — Archive and Search

Implemented: submitted multi-filter Archive search, compact result cards, expanded details, all-stage editing, individual deletion, and confirmed deletion of all Orders.

### S9 — Statistics

Implemented: closure-date period filters, persisted aggregates, explicit `Обновить и пересчитать`, Doctor balances and debt indicator, and Doctor-to-Archive navigation.

### S10 — Database exchange

Implemented: versioned JSON export/import for Doctors and Colors, combined Work/Expense Pricing, and full database backup/restore. Selective imports replace only their target dataset; full restore replaces all data after validation. Database-file switching is not part of the current application.

## Android validation

### S11 — Android application baseline

Implemented in source: Capacitor 8 shell (`com.vave.dentaltechcalendar`), Room and native SQLite bridge, shared schema migrations, and the current Android application adapter. `gradlew assembleDebug` passed on 2026-09-26 and produces `android/app/build/outputs/apk/debug/DentForLelikovsky.apk`. Physical-device validation is still open: `adb` could not enumerate a device in the available environment. No Android emulator is required for this project.

### S12 — Local deadline reminders

Implemented in source and included in the compiled debug APK: opt-in Android reminders, disabled/0 lead days/11:00 defaults, daily reminders for the selected 0–3 lead days through the deadline, patient/Doctor/deadline text, and schedule rebuild at application launch. Notification and exact-alarm permissions are requested only when reminders are enabled. Boot-time restore was declined; there is no boot receiver or `RECEIVE_BOOT_COMPLETED` permission. Actual delivery and permission flow remain unverified on a physical handset.

## Current exit criteria

- Keep the web app as the primary interface for ongoing usability changes.
- Keep docs/spec, business rules, and automated checks aligned with the implemented behavior.
- Run `npm test`, `npm run test:smoke`, and `npm run build` before accepting a validated web slice.
- Before Android release, install the debug/release package on a physical phone and verify startup, local persistence, closure/debt flows, and reminders. Do not treat successful Gradle assembly as device validation.
