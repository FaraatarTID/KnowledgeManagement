# Implementation Plan: Addressing Gaps & Risks

This plan targets the highest-impact gaps found in the current codebase and documentation. It is intentionally concrete and testable, with explicit deliverables and verification steps.

---

## Goals

1. **Replace placeholder tests with real, behavior-asserting checks.**
2. **Finish critical “placeholder” implementations in vector services.**
3. **Document architecture decisions and boundaries.**
4. **Close operational observability gaps (error tracking).**

---

## Phase 1 — Test Suite Credibility (Highest Priority)

**Problem:** Some tests explicitly do not validate behavior (e.g., `expect(true).toBe(true)`), which makes test counts misleading.

### Deliverables
- Replace placeholder tests with real integration tests that execute code paths.
- Remove or quarantine “non-tests” so test reports reflect real coverage.
- Document testing scope and expected runtime (fast vs integration).

### Tasks
1. **Audit for placeholders**
   - Search for `expect(true).toBe(true)` and comments indicating “validated through architecture review.”
2. **Convert to real tests**
   - Example: for RBAC vector filtering, mock vector results and assert that filters are applied before similarity scoring.
   - For performance claims, use deterministic benchmarks or remove claims from tests.
3. **Split test suites**
   - Rename or tag “slow/integration” tests and ensure they run in CI with clear separation.

### Verification
- CI output must show the updated tests passing.
- Test logs should demonstrate real assertions against behaviors, not constants.

---

## Phase 2 — Vector Service Completeness

**Problem:** Vector service has multiple placeholder implementations (e.g., `getVectorCount()` returning `0`, stubbed Vertex AI calls).

### Deliverables
- Real implementation for `getVectorCount()` (with Vertex AI or documented fallback).
- Implement or remove stubbed methods in `getAllVectors()` and `updateDocumentMetadata()`.
- Add tests for cache invalidation and metadata synchronization.

### Tasks
1. **Implement `getVectorCount()`**
   - Use Vertex AI index metadata API (or a well-documented local fallback).
2. **Complete vector data flows**
   - Replace commented-out calls with real API calls where possible.
   - If full implementation is not feasible, explicitly guard with `throw new Error` and document limitations.
3. **Validate cache invalidation**
   - Ensure invalidation triggers on update/delete and is covered by tests.

### Verification
- Add integration tests that mock Vertex AI client behavior.
- Ensure health endpoints expose accurate vector counts.

---

## Phase 3 — Architecture Documentation

**Problem:** Claims of “standard architecture” are not backed by diagrams or ADRs.

### Deliverables
- High-level architecture diagram (services, data flows, external dependencies).
- ADRs for major decisions (RAG approach, vector store selection, auth model).
- Mapping to a chosen architectural standard (e.g., layered, hexagonal).

### Tasks
1. **Create `/docs/architecture/` directory**
   - `overview.md` (diagram + narrative)
   - `decisions/` ADRs (one per decision)
2. **Define boundaries**
   - Document module boundaries and dependency rules.
3. **Align README**
   - Update README to link to architecture docs.

### Verification
- Review doc completeness checklist.
- Ensure ADRs include: context, decision, alternatives, consequences.

---

## Phase 4 — Operational Observability (Error Tracking)

**Problem:** Error tracking integration is a TODO, leaving a real operational blind spot.

### Deliverables
- Integrate an error tracking service (e.g., Sentry) in the client and server.
- Capture error context (request ID, user, environment).
- Add documentation on configuration and privacy boundaries.

### Tasks
1. **Select provider**
   - Prefer Sentry due to client + server coverage.
2. **Wire up client ErrorBoundary**
   - Capture errors with metadata and release version.
3. **Wire up server error handler**
   - Report unexpected errors in production only.
4. **Document configuration**
   - Update `.env.example` and deployment docs.

### Verification
- Simulate errors in dev and validate delivery to provider.
- Confirm request ID correlation between client/server.

---

## Execution Order (Recommended)

1. **Phase 1 (Tests)** — prevents false confidence.
2. **Phase 2 (Vector service)** — unblocks correctness of core features.
3. **Phase 4 (Observability)** — closes operational gaps.
4. **Phase 3 (Architecture docs)** — document stable state after code changes.

---

## Success Criteria

- No placeholder tests remain in the test suite.
- Vector service methods return real data or explicitly fail with documented constraints.
- Architecture documentation exists and is linked from README.
- Error tracking is operational and tested.

