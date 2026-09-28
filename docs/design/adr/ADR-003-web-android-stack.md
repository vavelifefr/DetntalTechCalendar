# ADR-003 — Web and Android application stack

Status: Accepted
Date: 2026-09-24

## Context

The project develops features in a local web version first, then packages validated milestones for Android. The stack must keep application and domain logic reusable while allowing each platform to use its own persistence adapter.

## Decision

### Frontend

- React + TypeScript + Vite.

### Web development runtime

- Node.js 24 LTS + Fastify.

### Web persistence

- SQLite via `better-sqlite3`.

### Android runtime and persistence

- Capacitor 8.
- A platform-specific SQLite repository adapter.

### Shared code

- Domain and application logic live in TypeScript packages.

### Testing

- Vitest + Playwright.

## Consequences

- Web features use a local Node process and a local SQLite database; no external SQL server is required.
- The web persistence adapter and Android persistence adapter remain platform-specific.
- Both platform adapters provide the operations used by the shared application layer; screens do not call the web API or native database directly.
- Android core flows use the device-local SQLite database and do not require Fastify or a network connection.
- Domain and application packages must not depend on UI or persistence implementations.
- Android packaging follows validated web milestones.
- Android permissions and cloud services remain outside this decision.
