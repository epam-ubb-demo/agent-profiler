---
title: "ADR-0005: Browser Shell + HTTP API Architecture (E5)"
description: Future browser-accessible architecture using Fastify + tRPC.
---

## Status

Accepted (architectural only — no runtime implementation in v1)

## Date

2026-05-01

## Context

Agent Profiler is currently an Electron desktop app. Teams have requested a browser-accessible variant for environments where installing desktop apps is restricted (e.g., locked-down corporate laptops, CI/CD dashboards). This ADR documents the future browser architecture without implementing it in v1.

## Decision

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Browser Client                       │
│  ┌───────────────┐  ┌───────────────────────────┐  │
│  │ Vite SPA      │  │ Shared UI components      │  │
│  │ (apps/web)    │  │ (@agent-profiler/ui)      │  │
│  └───────┬───────┘  └───────────────────────────┘  │
│          │                                           │
│  ┌───────┴───────────────────────────────────────┐  │
│  │ HttpApiDataSource (tRPC client)                │  │
│  └───────────────────────┬───────────────────────┘  │
└──────────────────────────┼──────────────────────────┘
                           │ HTTP/SSE
┌──────────────────────────┼──────────────────────────┐
│  ┌───────────────────────┴───────────────────────┐  │
│  │ Fastify + tRPC server (apps/api)              │  │
│  │ ├─ listSessions()                            │  │
│  │ ├─ getSession(id)                            │  │
│  │ ├─ getAnnotations(sessionId)                 │  │
│  │ └─ subscribe() [SSE for live updates]        │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                           │
│  ┌───────────────────────┴───────────────────────┐  │
│  │ LocalFsDataSource + AnnotationsRepository     │  │
│  └───────────────────────────────────────────────┘  │
│                   Server (apps/api)                   │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Fastify + tRPC** — Type-safe end-to-end API with automatic client generation from server router types. Fastify provides excellent performance and plugin ecosystem.

2. **HttpApiDataSource** — Implements the same `SessionDataSource` interface as `LocalFsDataSource`, allowing UI components to work identically in both Electron and browser modes.

3. **SSE for live streaming** — Server-Sent Events for real-time updates when new sessions appear or active sessions update. Lighter than WebSocket for one-directional data flow.

4. **Shared zod schemas** — The existing IPC zod schemas from `@agent-profiler/core` are reused as tRPC input/output validators, ensuring a single source of truth.

5. **Auth placeholder** — OAuth2 stub interface designed for future integration (Azure AD, GitHub OAuth). No authentication in v1.

6. **Same UI components** — `@agent-profiler/ui` is renderer-agnostic. The browser app shell simply wraps it with `HttpApiDataSource` instead of `LocalFsDataSource`.

### Future Package Structure

```
apps/
├── desktop/     # Electron app (existing)
├── api/         # Fastify + tRPC server (future)
└── web/         # Vite SPA (future)
```

### API Contract (tRPC Router Shape)

```typescript
const appRouter = router({
  sessions: router({
    list: publicProcedure
      .input(z.object({ source: z.enum([...]).optional() }))
      .query(/* ... */),
    get: publicProcedure
      .input(z.object({ id: z.string() }))
      .query(/* ... */),
    subscribe: publicProcedure
      .subscription(/* SSE stream */),
  }),
  annotations: router({
    list: publicProcedure
      .input(z.object({ sessionId: z.string() }))
      .query(/* ... */),
    create: publicProcedure
      .input(createAnnotationSchema)
      .mutation(/* ... */),
  }),
});
```

### Live Streaming Design

```
File watcher (chokidar) in API server
    ↓ detects new/modified .jsonl files
    ↓
SSE endpoint (/api/sessions/subscribe)
    ↓ pushes { type: 'session_added' | 'session_updated', sessionId }
    ↓
HttpApiDataSource.subscribe()
    ↓ invalidates TanStack Query cache
    ↓
UI re-renders with new data
```

## Consequences

### Positive
- Teams without desktop app access can use Agent Profiler via browser
- CI/CD integration possible (e.g., post-build dashboard)
- Same UI components shared — no feature divergence
- tRPC provides end-to-end type safety

### Negative
- Additional deployment complexity (server process)
- File system access requires the server to run on the same machine as logs (or NFS mount)
- SSE doesn't support bi-directional communication (annotations need separate POST calls)

### Not Implemented in v1
- `apps/api` package
- `apps/web` package
- `HttpApiDataSource`
- SSE streaming
- OAuth2 integration

These will be implemented when there is validated demand from teams.

## References

- F5.1: HTTP API stub (apps/api) — Issue #36
- F5.2: HttpApiDataSource — Issue #37
- F5.3: Browser app shell (apps/web) — Issue #38
- F5.4: Live streaming — Issue #39
