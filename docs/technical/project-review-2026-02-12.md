# Project Review — 2026-02-12

This review assumes the target claim is "production ready" and tests whether that claim survives build, dependency, and operational checks.

## Executive verdict

The repo is close to operationally strong on the backend but is not currently production-ready as a full stack delivery artifact because frontend dependency installation is blocked in this environment and baseline client build/test/lint checks cannot run. The fastest path to the right outcome is to lock dependency compatibility and make CI gate on `build + test` for both server and client before any release tag.

## What was verified

- Server automated tests: pass (`107/107`).
- Server lint command now exists (`npm run lint --prefix server`) and executes strict TypeScript no-emit checks.
- Server TypeScript build: fixed and now passes after strict typing fixes in `UserService` and `VectorService`.
- Client test/lint/build execution: blocked due unresolved local dependency install (`403 Forbidden` fetching `react-dom`), so no trustworthy signal exists for client release readiness in this environment.
- Client dependency preflight was added as `npm run doctor:deps --prefix client` (warning mode, non-fatal) with `npm run doctor:deps:strict --prefix client` for CI-fail behavior when registry policy blocks required packages.

## Critical findings

The main risk is false confidence from backend-only validation while client verification is absent. `README.md` labels the system as "Production Ready", but client build validation is currently unavailable in this environment, and client dependency constraints include a known tension (`react@19` with `@testing-library/react@14`) that can create flaky local setup behavior and avoidable CI churn.

A secondary risk was server release fragility from TypeScript strictness regressions. `server/src/services/user.service.ts` had a typed status mismatch in mock-user creation, and `server/src/services/vector.service.ts` had possible undefined array access in top-K similarity selection. Those are now fixed and server build compiles successfully.

## Quantified risk estimate

If shipped without restoring end-to-end client validation gates, expected risk is roughly:

- ~45% chance of release delay from client dependency/tooling breakage (1-3 days each incident).
- ~25% chance of a "green backend / broken frontend" deployment event in the next two release cycles.
- ~15% chance of emergency rollback driven by untested client production bundle behavior.

These are directional engineering-risk estimates based on current absence of reproducible client verification and existing dependency mismatch signals.

## Single best next move

Create one non-negotiable release gate: `server build+test` and `client install+build+test+lint` must all pass in CI on a clean environment, then pin/adjust the client testing dependency set to be React 19 compatible (or deliberately downgrade React to match the testing stack). Do that first; everything else is optimization.

## Files changed in this review

- `server/src/services/user.service.ts`: tightened mock user typing to satisfy strict compile-time `UserStatus` constraints.
- `server/src/services/vector.service.ts`: guarded top-K lowest-score comparisons against possibly undefined indexed items under strict TS settings.
- `server/package.json`: added a missing `lint` script (`tsc --noEmit`) so lint gate exists in CI.
- `client/package.json` and `client/scripts/preflight-client-deps.mjs`: added dependency preflight commands (`doctor:deps` warning mode and `doctor:deps:strict` fail mode) to detect blocked packages before install/build/lint/test runs.
