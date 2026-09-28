# Architecture

Status: the web application boundary and Android `ApplicationPort` adapter are implemented in source. A debug APK compiled successfully on 2026-09-26; physical-device validation remains pending.

## Goals

- Local-first.
- Simple development loop.
- One authoritative local database.
- Strong testability.
- Easy context recovery for LLM agents.
- Web-first feature development.
- Android packaging after stable slices.
- Minimal Android permissions.

## High-level shape

```text
UI
│
├─ Calendar / Orders / Archive / Debts / Pricing / Statistics / Settings
│
Application / Use Cases
│
├─ Order workflow
├─ Pricing calculation
├─ Search/filtering
├─ Closure/accounting
├─ Import/export
│
Domain
│
├─ Order
├─ WorkItem
├─ Doctor
├─ PricingItem
├─ Financial snapshot
│
Repository interfaces
│
├─ OrdersRepository
├─ PricingRepository
├─ SettingsRepository
├─ DatabaseManagementRepository
│
Persistence adapters
├─ Web: local Node process + SQLite
└─ Android: SQLite via Room and the bundled SQLite driver
```

## Web development architecture

Accepted direction:

```text
Browser UI (React + TypeScript + Vite)
   ↓
ApplicationPort (platform-neutral operations)
   ↓
Web adapter (maps operations to the local API)
   ↓
Node.js 24 LTS + Fastify
   ↓
SQLite file via better-sqlite3
```

`packages/application` defines `ApplicationPort` and the data contracts used by application screens. Screens call this port for startup data and all current order, WorkItem, expense, closure, debt, Archive, Statistics, Pricing, directory, settings, and JSON exchange operations. They do not call Fastify routes or persistence APIs directly.

The POCO X7 Pro `DeviceFrame` is a browser-only preview wrapper. Capacitor native builds automatically use the application-only layout without the simulated device frame; in a development browser, `?computerUse=1` selects that same layout for computer-use checks. Production web keeps the device preview.

`apps/web/src/web-application.ts` implements the port using the existing local Fastify API. The web entry point injects this adapter. The Capacitor 8 Android shell uses application ID `com.vave.dentaltechcalendar`. `android/app` declares Room 2.8.5 with bundled SQLite driver 2.7.1, applies the same numbered SQL migration assets as the web database, and exposes a native SQLite bridge to TypeScript. `apps/web/src/android-application.ts` implements all current `ApplicationPort` operations over that bridge; `main.tsx` selects it when Capacitor reports Android. Android order reminders use a small native Capacitor plugin and `AlarmManager`; reminder preferences are stored in SQLite `app_settings`, while the native alarm cache is derived from active Orders. Android notification and exact-alarm permissions are requested only when the user enables reminders. `gradlew assembleDebug` passed on 2026-09-26 and produces `android/app/build/outputs/apk/debug/DentForLelikovsky.apk`. Device-side notification and permission flows have not been verified because no handset was enumerated by `adb`.

No MySQL/PostgreSQL/SQL Server is required.

The local server/process is development/runtime infrastructure for the web version, not a cloud service.

## Android architecture

```text
Capacitor 8 application shell
   ↓
Shared TypeScript application/domain packages
   ↓
Platform-specific SQLite repository adapter
   ↓
Android SQLite data layer
   ↓
Native local deadline reminders (AlarmManager and NotificationManager)
```

Reminder scheduling is synchronized at app startup and after Order or reminder-setting changes. No boot receiver is registered; if the device restarts, opening the app rebuilds the schedule. The reminder system has no network or cloud dependency.

Stack choice and shared-code boundaries are recorded in `docs/design/adr/ADR-003-web-android-stack.md`.

## Shared logic principle

Business rules should be isolated from UI code so that:
- web UI;
- Android application shell;
- automated tests

can reuse or validate the same behaviour.

Do not let screen components become the only place where business rules exist.

Domain and application logic live in TypeScript packages. Persistence adapters remain platform-specific.

## Persistence

SQLite is authoritative persistent storage.

The app has one active local SQLite database. On first startup, an empty database is initialized in the app's local data area; directory, Pricing, Orders, and settings are stored in that database.

Versioned JSON files are used for:
- exporting/importing the Doctor directory;
- exporting/importing Pricing;
- exporting/importing a full database backup;
- fixtures and deterministic test data.

Selective imports replace the selected dataset in the active database and preserve Orders and unrelated datasets. A full-database restore replaces the active database contents after format, schema-version, and integrity validation. Imports must be atomic: invalid input must leave the active database unchanged.

Settings selects JSON files for import/export; it does not attach separate live data files.

JSON is not the primary production database.

## Search

Search must be database-driven and index-friendly.

Expected searchable dimensions include:
- doctor;
- patient label;
- deadline;
- closure date;
- amount;
- debt;
- work type;
- Order status;
- WorkItem status.

Avoid designs that require loading the entire database into memory for every search.

## History and snapshots

Archived values must be stored as historical values.

Pricing references may exist for traceability, but the archived Order must not depend on current Pricing values.

## Database migrations

Every schema version change requires:
- numbered migration;
- migration test;
- updated schema version;
- backward compatibility decision.

## Security

Default:
- no cloud;
- no external SQL server;
- no unnecessary permissions;
- no hidden data transmission.

Any future network feature requires explicit product decision and architecture review.
