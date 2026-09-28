# SDD / Development Workflow

## Principle

Every meaningful change follows:

```text
Requirement
→ Acceptance criteria
→ Design impact
→ Implementation
→ Automated tests
→ Smoke tests
→ QA review
→ Fixes
→ Green state
→ Project state update
```

Do not commit or push unless the user explicitly requests it.

## Canonical application behavior

For behavior that already exists, the current application is the compatibility baseline. If an old prompt/specification or a regression test conflicts with the running implementation, verify the current behavior and align the stale document and test; do not silently alter the product to match historical text. A deliberate change from the current behavior requires a new or updated requirement and acceptance criteria before implementation.

## 1. Requirement

Add/update stable requirement IDs in:
- `docs/spec/SPEC.md`
- `docs/spec/BUSINESS_RULES.md`

Do not begin implementation from chat-only requirements.

## 2. Active task

Create/update `work/ACTIVE_TASK.md` with:
- goal;
- related requirement IDs;
- non-goals;
- affected modules;
- acceptance criteria;
- test commands.

## 3. Design impact

If implementation changes:
- architecture → ADR;
- schema → migration;
- business invariant → BUSINESS_RULES + test;
- export format → versioned format documentation.

## 4. Implementation

Prefer one vertical behaviour at a time.

Avoid large cross-project rewrites without an explicit task.

## 5. Verification

Run:
1. unit tests;
2. integration tests;
3. slice smoke tests;
4. QA agent scenarios when relevant.

No known failing test should be silently ignored.

## 6. Commit

Use atomic commits, examples:

```text
feat(order): support multiple work items
fix(pricing): preserve archived totals
test(search): add debt filter regression
docs(adr): record sqlite decision
```

## 7. Project state

Update `PROJECT_STATE.md` when:
- milestone changes;
- major feature completes;
- schema version changes;
- known blocking bug appears/disappears;
- test baseline materially changes.

## 8. Handoff / context compaction

Before intentionally switching a long LLM context:

Update `work/HANDOFF.md`:

- current objective;
- what is already done;
- files changed;
- tests run and results;
- known problems;
- next exact action;
- things that must not be redone.

A new agent/context should first read:

1. `AGENTS.md`
2. `PROJECT_STATE.md`
3. `work/HANDOFF.md`
4. `work/ACTIVE_TASK.md`
5. only the specific linked requirements/design documents

This is preferred over reconstructing state from chat history.

## Definition of Done for a slice

A slice is Done only when:
- acceptance criteria are met;
- relevant tests are green;
- smoke tests are green;
- no undocumented schema change exists;
- docs reflect changed business behaviour;
- `PROJECT_STATE.md` is current.
