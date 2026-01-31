# Changelog

## [1.1.0-secure] - 2026-01-31

### Zero-Trust Hardening & Verification

- **Security**:
  - **Purged "Demo Mode"**: Removed all hardcoded credentials and insecure fallback logic from `AuthService` and `UserService`.
  - **Enforced Production Failsafes**: Implemented strict environment validation; system now "Fails Fast" and refuses to start in `production` if Supabase credentials or `INITIAL_ADMIN_PASSWORD` are missing.
  - **Bootstrap Hardening**: Secured initial admin creation to require environmental configuration, preventing 'admin123' defaults in live environments.
- **RAG Architecture**:
  - **Integrity Factory**: Implemented structured JSON generation for RAG responses with machine-verified citation checking.
  - **Adversarial Resilience**: Verified system stability against prompt injection and hallucination attempts.
- **Verification**:
  - Expanded integration test suite to 28 passing tests covering RBAC, Modern RAG, and Security stress tests.
  - Implemented standardized Vitest mocks for the authentication layer to ensure consistent testing without compromising production security rules.

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
