# ADR-001 — SQLite as primary persistence

Status: Accepted
Date: 2026-09-24

## Context

The application must:
- work locally;
- avoid mandatory cloud infrastructure;
- support flexible search;
- store years of Orders;
- export/import data;
- run on Android;
- have a web development version.

Expected volume is small: roughly 10–20 Orders per month, far below SQLite capacity.

## Decision

Use SQLite as the primary persistent database.

Web:
- local Node process;
- SQLite file;
- no external SQL server.

Android:
- SQLite through the Android data layer;
- Room is the intended default wrapper unless superseded by a later ADR.

Use JSON/versioned portable formats for fixtures and selective import/export where useful.

## Consequences

### Positive
- serverless;
- small footprint;
- indexed queries;
- transactions;
- relational integrity;
- simple backup;
- strong Android support;
- huge performance margin for expected data volume.

### Negative
- schema migrations must be managed;
- web and Android need separate persistence adapters;
- direct browser-only access to native SQLite is not the chosen primary development approach.

## Rejected alternative

Primary JSON database.

Reason:
complex combined filtering, relationships, accounting and long-term evolution would become harder and less reliable.
