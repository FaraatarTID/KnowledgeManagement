# Architecture Overview

## High-Level Diagram

```
┌─────────────────────────────┐        ┌────────────────────────────┐
│        Client (Next.js)      │        │         Server (Express)   │
│  - UI, auth, error boundary  │  HTTP  │  - API routes + middleware │
│  - RAG query + chat           ├──────▶│  - Auth, RAG pipeline       │
│  - Document management        │        │  - Vector search engine    │
└─────────────────────────────┘        └──────────────┬──────────────┘
                                                      │
                                                      │
                                                      ▼
                                            ┌────────────────────────┐
                                            │  Hybrid Data Layers    │
                                            │  - SQLite (Local DB)   │
                                            │  - Gemini (AI Brain)   │
                                            │  - Google Drive (Docs) │
                                            │  - Vertex AI (Scale)   │
                                            └────────────────────────┘
```

## Core Flows

### 1) Document Upload (Saga Pattern)

1. Client uploads a document.
2. Server executes a saga transaction:
   - Persist metadata
   - Index for AI search
   - Record audit/history
3. If any step fails, compensations run in reverse order.

### 2) RAG Query

1. Client sends a query with auth context.
2. Server builds an embedding, queries the vector store with RBAC filters.
3. Server composes context and runs the LLM call.
4. Server validates hallucination checks and returns citations.

### 3) Authentication

1. Email/password validation with jitter + minimum timing floor.
2. Account lockout after repeated failures.
3. JWT-based session management with role enforcement.

## Boundaries & Responsibilities

| Layer     | Responsibility                                   |
| --------- | ------------------------------------------------ |
| Client    | UI, state, local storage, error boundary         |
| API Layer | Request validation, auth, rate limits, logging   |
| Services  | Vector search, RAG pipeline, document processing |
| External  | Supabase, Vertex AI, Google Drive                |

## Architecture Principles

1. **Fail loudly for critical infrastructure** (Vertex AI connectivity).
2. **Apply RBAC at the vector store** (filters before similarity).
3. **Idempotent sagas** for multi-step write operations.
4. **Observability-first** with structured logs + error tracking.
