# AIKB Technical Architecture

This document details the industrial engineering patterns implemented in the AI Knowledge Base (AIKB) to ensure persistence integrity, security isolation, and observability.

---

## 1. Persistence Layer: Safe Industrial JSON Storage

The system uses a custom `JSONStore` utility for atomic data persistence.

### Key Patterns:

- **Global Path-Based Locking**: Uses a process-wide `static` Mutex registry keyed by absolute file path. This ensures that multiple service instances (e.g., SyncService and VectorService) share the same lock for the same file, preventing synchronization collisions.
- **Shadow-Copy Pattern**: Writes are performed to a `.tmp` file and then atomically renamed using `fs.rename`. This prevents data corruption during system crashes.
- **Auto-Recovery**: If the primary file is missing or corrupt, the system automatically attempts recovery from a `.bak` file created during the last successful write.

---

## 2. Security Model: Strict Deny Isolation

AIKB follows a "Zero Trust" approach to internal data visibility.

- **Strict Deny**: If a document is missing department metadata, it is **locked by default**. It is only accessible to ADMINs.
- **Identity-Based Perimeter**: Access control is enforced at the service layer (`VectorService`), not just the API layer. Documents are filtered against the user's cryptographically verified department in the JWT.
- **Fail-Fast Bootstrapping**: In production, the system refuses to initialize without a secure, environmentally-defined `INITIAL_ADMIN_PASSWORD`.

---

## 3. Industrial API Loop

All API routes follow a standardized, hardened execution chain:

1. **Schema Validation**: `Zod` validates the Request Body, Query, and Params before any logic runs.
2. **Identity Verification**: `authMiddleware` extracts and validates the JWT.
3. **Observability Injection**: `AsyncContext` attaches a unique `requestId` to every operation.
4. **Resilient Execution**: `catchAsync` wraps the controller, ensuring any failure is propagated to the global error handler.
5. **Standardized Response**: Logic results are returned in a consistent JSON format with structured logging.

---

## 4. RAG Integrity Engine

To prevent AI hallucinations, the RAG loop includes a post-generation verification phase:

- **Attribution Verification**: The system verifies that every `[QUOTE]` reported by the AI actually exists within the source context provided.
- **PII Redaction**: Sensitivities like emails and phone numbers are redacted before being sent to the LLM to prevent data leakage.
- **Context Integrity**: The system calculates an `integrityScore` based on successful quote matches, which is audited for every query.

---

## 5. Observability Infrastructure

- **Structured JSON Logging**: All logs are emitted as single-line JSON objects, making them compatible with modern cloud monitoring stacks (Datadog, Grafana Loki, ELK).
- **Audit Logging**: Every sensitive action (RAG queries, document uploads, user changes) is recorded in a tamper-resistant PostgreSQL/Supabase table.
