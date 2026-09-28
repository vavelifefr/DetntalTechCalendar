# ADR-002 — Immutable Order identity

Status: Accepted
Date: 2026-09-24

## Context

During an active job:
- Doctor may change;
- deadline may change;
- work composition may change;
- price may change;
- new WorkItems may be added;
- patient label is not a full patient entity.

Therefore patient + Doctor + date is not a safe database key.

## Decision

Every Order receives an immutable internal ID at creation.

Patient label, Doctor and deadline remain mutable searchable attributes.

## Consequences

- references remain stable;
- financial and archive data remain linked correctly;
- changing a deadline does not create a new Order;
- changing Doctor does not break debt/history relations;
- the UI may still present patient/Doctor/date as human-readable context.
