# Handoff

## Current baseline

The current application is the behavior baseline for implemented features. `docs/spec/SPEC.md` and `docs/spec/BUSINESS_RULES.md` now document it; future intentional changes start by updating those requirements and their acceptance checks. Product code was not changed during the canon/QA reconciliation.

The local web stack is React + TypeScript + Vite, Fastify, and SQLite schema version 10. The Android app uses Capacitor 8, Room, the shared SQLite migrations, and application ID `com.vave.dentaltechcalendar`. The debug APK compiled on 2026-09-26. Reminder permission/delivery behavior has not been checked on a physical phone. Reminders are opt-in, default off/0 lead days/11:00, and rebuild when the app next opens after restart; there is no boot receiver.

## Accounting behavior

Income is the closure receipt plus recorded debt repayments. Balance is income minus expenses. Outstanding debt is independent and is not subtracted from balance. A debt entry can be created at closure when the user checks `Оформить как заказ с долгом`; its suggested amount is expected minus received and can be edited. Leaving the checkbox clear allows an underpaid Order to close without a debt entry. WorkItem accepted prices and expense values are historical snapshots; calculated Pricing amounts are form-only hints. Statistics changes after `Обновить и пересчитать`.

Current behavior for legacy data: existing `CANCELLED` Orders remain in Archive and, with a closure date, Statistics; they contribute zero income and retain expenses. The web UI does not offer Order cancellation. Cancelled WorkItems remain informational and do not contribute to totals.

## QA result

- `npm test`: 48 passed.
- `npm run test:smoke`: 8 passed.
- `npm run build`: passed; Vite emitted a chunk-size advisory above 500 kB.
- Browser checks use `DTC_DB_PATH=:memory:` and restore a full backup inside mutating scenarios. The shared web database was not touched.

## Next open check

Install the already-built debug APK on a physical Android phone and verify first launch, local persistence, reminder permission prompts, and notification delivery/rescheduling. No emulator is required. Do not install additional SDKs or packages without user approval.
