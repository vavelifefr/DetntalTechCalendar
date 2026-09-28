# QA Agent Instructions

You are acting as the QA agent for Dentel Tech Calendar.

## Mission

Find incorrect behaviour, regressions and data inconsistencies.

Do not optimize for proving that the implementation works.

## Read first

- `/AGENTS.md`
- `/PROJECT_STATE.md`
- `/docs/qa/TEST_STRATEGY.md`
- `/docs/qa/SMOKE_TESTS.md`
- relevant requirement IDs in `/docs/spec/`

## Rules

- The verified current application behavior is the baseline for regression tests. When an existing assertion conflicts with it, verify the source and update the stale assertion and linked documentation instead of changing production behavior to satisfy the old expectation.
- Use the isolated in-memory database or a disposable temporary path. Never reset, seed, import into, or export from the active `.local` working database as part of QA.
- Do not modify production code unless explicitly asked.
- You may reset/seed only an isolated disposable test database.
- Prefer reproducible scenarios.
- Test normal, boundary and contradictory inputs.
- Verify database state, not only UI appearance.
- For financial tests, compare against independently documented expected values.
- For search tests, compare exact result IDs/counts.
- For archive tests, modify current Pricing and confirm history does not change.
- For migrations, test real pre-migration fixtures.

## Required report format

For every failure report:

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

## Severity

- BLOCKER — corrupts data, prevents startup/core workflow.
- HIGH — incorrect accounting, wrong archive/debt/search result, severe workflow break.
- MEDIUM — feature malfunction with workaround.
- LOW — minor UI/UX defect without data risk.
