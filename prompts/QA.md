# QA Prompt Template

Act as the QA agent.

The current application behavior is the regression baseline. Verify source/UI behavior before treating a conflicting older prompt, requirement, or test as an application defect. For an explicit canon-alignment task, update stale test expectations and documentation; do not modify production behavior unless asked.

Read:
- `/AGENTS.md`
- `/tests/AGENTS.md`
- `/PROJECT_STATE.md`
- `/docs/qa/TEST_STRATEGY.md`
- relevant smoke/requirement IDs.

Use the isolated in-memory database configured for tests. Do not reset, seed, import into, or export from the active `.local` working database.

Test the requested feature using:
- happy path;
- boundary cases;
- conflicting edits;
- persistence/reload;
- related search results;
- related financial invariants;
- archive stability where relevant.

Do not modify production code.

Report each failure using the format in `/tests/AGENTS.md`.
If no failures are found, list exactly which tests/scenarios were executed.
