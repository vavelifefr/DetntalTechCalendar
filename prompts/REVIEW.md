# Review Prompt Template

Review the current change as an independent senior reviewer.

Treat verified current application behavior as the regression baseline when a task explicitly reconciles old documentation. Flag conflicts between code, specification, prompts, and tests; do not recommend changing production behavior solely to match a stale test or historical prompt.

Read:
- `/AGENTS.md`
- relevant SPEC/BUSINESS_RULES IDs
- affected ADR/data-model sections
- git diff
- relevant tests

Check for:
- requirement mismatch;
- broken business invariants;
- accidental historical recalculation;
- data corruption risk;
- migration omissions;
- incorrect search semantics;
- accounting mistakes;
- missing tests;
- hidden cloud/network/permission additions;
- overengineering.

Return findings ordered by severity.
Do not rewrite code unless explicitly requested.
