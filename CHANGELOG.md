# Changelog

## [1.0.0-industrial] - 2026-01-26

### Industrial Hardening (Rounds 8-10)

- **Persistence**: Refactored `JSONStore` with a global **Path-Based Lock Registry** and Shadow-Copy pattern to prevent process-level race conditions.
- **Observability**: Implemented system-wide structured JSON logging with `AsyncContext` for request-cycle tracing.
- **Security**:
  - Standardized on **Argon2id** for password hashing.
  - Implemented **Strict Deny** department isolation in `VectorService`.
  - Enforced **Zod Validation** for all API ingress points (Body/Query/Params).
- **Architecture**:
  - Centralized industrial middleware loop (Validate -> Log -> Execute -> Catch).
  - Implemented RAG integrity engine with quote verification and PII redaction.
- **Reliability**: Scaled Vitest suite to 73 tests covering deep RBAC and flow simulations.

### Unreleased (Legacy)

- server: enforce legacy `/chat` validation (require `documents`), add `SUPPORT_LEGACY_CHAT` feature flag (default: enabled).
- tests: add jest -> vi compatibility shims; fix race-condition tests and vector service mocks.
