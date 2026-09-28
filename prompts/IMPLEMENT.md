# Implementation Prompt Template

Use this when delegating an implementation task to Codex/LLM.

## Instructions

Read:
- `/AGENTS.md`
- `/PROJECT_STATE.md`
- `/work/ACTIVE_TASK.md`
- only requirement/design files linked by the active task.

Implement only the active task.

For behavior already implemented, verify current source and UI before relying on older prompt/spec text. During an explicit canon-alignment task, the current application is the baseline: align stale documentation and tests instead of changing production behavior. For a new behavior change, update the requirement and acceptance criteria first.

Before coding:
1. summarize affected requirement IDs;
2. identify schema/ADR impact;
3. identify tests that must be added/updated.

During coding:
- preserve existing invariants;
- keep changes small;
- do not install system tooling without approval.

After coding:
1. run relevant tests;
2. run relevant smoke tests;
3. report failures;
4. update `PROJECT_STATE.md` if state changed;
5. list changed files and any new ADR/migration.
