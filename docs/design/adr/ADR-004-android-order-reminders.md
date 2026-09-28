# ADR-004 — Android local Order reminders

Status: accepted

## Context

Users need configurable deadline reminders on Android while the application remains local-first. They want daily reminders from a selected lead time through the Order deadline and patient/Doctor details visible in the notification.

## Decision

- Store reminder preferences in the existing SQLite `app_settings` table.
- Keep reminders disabled by default; use lead time `0` days and `11:00` as initial values.
- Use a native Capacitor plugin with Android `AlarmManager` and `NotificationManager` for exact local scheduling and notification display.
- Schedule only active Orders with a deadline; resynchronize on startup and after Order or preference changes.
- Request `POST_NOTIFICATIONS` and exact-alarm access only when the user enables reminders.
- Do not add a boot receiver or `RECEIVE_BOOT_COMPLETED`; after a device restart, opening the app rebuilds the schedule.
- Show patient, Doctor, and deadline details on the lock screen as requested by the user.
- Do not add a cloud notification service or third-party runtime package.

## Consequences

The reminders can be delivered while the app is not open. A device restart clears scheduled alarms, so reminders resume after the next app launch. Native Android compilation and device validation remain part of pre-release work.
