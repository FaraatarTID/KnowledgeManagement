# Migration: Legacy `/chat` Removal Plan

Goal: migrate clients from legacy `/chat` (client-supplied `documents`) to the RAG-based `/chat` (server performs vector search).

1. Feature flag
   - `SUPPORT_LEGACY_CHAT` (env) controls legacy behavior. Default: enabled.
   - For staging, set `SUPPORT_LEGACY_CHAT=false` to validate new flow.

2. Compatibility testing
   - Run full integration suite and client E2E tests against staging with the flag disabled.
   - Fix any regressions and update clients.

3. Deprecation timeline
   - 2 weeks: Announce deprecation and publish migration notes.
   - 4 weeks: Flip default flag to `false` in staging/CI for final verification.
   - 6 weeks: Remove legacy code paths and tests.

4. Cleanup
   - Remove `SUPPORT_LEGACY_CHAT` and related legacy handler code.
   - Update CHANGELOG and docs.
