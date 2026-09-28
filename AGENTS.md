# Dentel Tech Calendar — Agent Instructions

## Project

Dentel Tech Calendar is a local-first workflow, calendar and accounting application for dental technicians.

The primary development environment is the local web version.
Validated milestones are then packaged and tested as an Android APK.

## Sources of truth

For this application's current behavior, the running implementation is the baseline. When current code/UI and older prompts, specifications, or tests disagree, first verify the implemented behavior, then align the stale documents and tests to it. Do not change application behavior during documentation/test reconciliation unless the user separately requests a behavior change or a clear defect must be reported.

After reconciliation, use these sources for future work:

1. Current implemented behavior as captured by `docs/spec/` and `docs/spec/BUSINESS_RULES.md`.
2. Architecture and data model: `docs/design/`.
3. Automated regression checks aligned to the application: `tests/` and `docs/qa/`.
4. Current project state: `PROJECT_STATE.md`.
5. Current temporary objective: `work/ACTIVE_TASK.md`.
6. Handoff notes when present: `work/HANDOFF.md`.

Historical prompts and earlier chat decisions do not override the current implementation. A future intentional behavior change should update the requirements first, then implementation and regression checks.

## Critical invariants

- The application is local-first.
- Do not introduce cloud services or mandatory network dependencies without explicit approval.
- Do not add Android permissions without explicit approval.
- SQLite is the persistent database.
- Web development uses a local application/backend process and SQLite; no external SQL server is required.
- Android persistence uses SQLite through the Android data layer (Room is the intended default unless later changed by ADR).
- Archived financial values must never be recalculated from current Pricing.
- Pricing is an input/autofill source for new work, not a live dependency of archived work.
- An Order has one immutable internal ID.
- Doctor, patient label, deadline and work composition may change without changing the Order ID.
- Each Order has exactly one common deadline.
- WorkItems may be completed/cancelled independently but do not close the Order automatically.
- Intermediate WorkItem completion does not post final accounting.
- Final accounting values are confirmed/editable only during Order closure.
- Existing business rules must not be silently changed.
- Database schema changes require migrations and migration tests.
- Do not install SDKs, system packages or additional tooling without explicit user approval.

## Before implementation

Read only the documents relevant to the task.

At minimum:
- `PROJECT_STATE.md`
- `work/ACTIVE_TASK.md`
- related requirement IDs in `docs/spec/SPEC.md`
- related invariants in `docs/spec/BUSINESS_RULES.md`
- related architecture/data model sections

Do not reread the whole repository unless necessary.

## During implementation

- Prefer small, reviewable changes.
- Preserve existing behaviour unless the active task explicitly changes it.
- Update or add tests together with behaviour changes.
- If an architectural decision changes, create or update an ADR.
- If a database schema changes, add a migration and migration tests.
- Never hide test failures.
- When a regression check disagrees with verified current behavior, update the check and its related documentation; do not force the application back to an obsolete expectation.

## After implementation

1. Run relevant unit tests.
2. Run relevant integration tests.
3. Run the smoke set for the affected slice.
4. Report failures explicitly.
5. Update `PROJECT_STATE.md` if the repository state materially changed.
6. Update `work/ACTIVE_TASK.md` or `work/HANDOFF.md` when the task/session boundary changes.
