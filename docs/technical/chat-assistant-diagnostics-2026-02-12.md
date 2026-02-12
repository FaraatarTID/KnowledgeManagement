# Chat Assistant Diagnostics — 2026-02-12

## Objective

Perform a rigorous diagnostics pass for the Gemini-based chat assistant subsystem, with emphasis on:

- API contract correctness and stability
- RAG execution safety and timeout behavior
- Local/manual (non-Drive) deployment behavior
- Test coverage and operational readiness signals

## Methodology

1. Static code review across controller/service/client integration points.
2. Contract-path inspection for modern (`/query`) and legacy (`/chat`, `/legacy-chat`) behavior.
3. Targeted runtime validation via lint and focused test suites.
4. Gap analysis with severity and remediation guidance.

## Diagnostic findings

## A. Critical/High findings

### A1) RAG timeout-budget arithmetic bug (fixed)

**Observation**
The remaining-time calculation for the Gemini generation leg in `RAGService` used inverse arithmetic that could exceed the intended request budget instead of honoring elapsed time.

**Impact**
Timeout enforcement could be weaker than intended, allowing longer-than-configured waits under load and reducing predictability of latency SLOs.

**Action taken**
- Added a dedicated `remainingBudgetMs()` helper that computes `operationDeadline - Date.now()` correctly.
- Added a floor (`100ms`) and cap (`REQUEST_TIMEOUTS.RAG_QUERY`) for safe bounds.

## B. Medium findings

### B1) Legacy and modern chat response contract drift (already addressed)

Legacy endpoints now return `answer` while preserving `content` for compatibility, along with baseline `sources` and `integrity` fields. This materially reduces client-side branching risk.

### B2) Local/manual mode observability (already addressed)

Health endpoint now exposes:

- `mode.driveConfigured`
- `mode.ingestionMode` (`google_drive` | `local_manual`)

This improves operational clarity in non-cloud deployments.

## C. Low findings / polish

### C1) React key stability in chat list (already addressed)

Chat row rendering now uses stable message IDs instead of array index keys, reducing reconciliation anomalies in append/edit scenarios.

### C2) Client test environment dependency gap (not code bug)

Client tests are blocked in this environment because `vitest` is unavailable due dependency-install restrictions (`403 Forbidden` for `react-dom` fetch). This is an environment/registry policy issue rather than a runtime code defect.

## Validation runbook used

- `npm run --prefix server lint`
- `npm run --prefix server test -- src/__tests__/chat.test.ts src/__tests__/unit/controllers/chat.controller.test.ts src/__tests__/unit/services/gemini.service.test.ts src/__tests__/integration/race-conditions.test.ts`
- `npm install --prefix client` (fails due registry policy)

## Post-fix confidence statement

Based on static analysis and executed tests, the chat assistant path is stable and materially improved in three areas:

1. **Deterministic timeout-budget behavior** in RAG orchestration.
2. **Stronger API contract consistency** between modern and legacy chat endpoints.
3. **Improved deployment diagnostics** for local/manual ingestion mode.

Residual risk remains primarily in client CI/install reproducibility under restricted registry policy; this should be handled as an environment governance item.
