# Changelog

## Unreleased

- server: enforce legacy `/chat` validation (require `documents`), add `SUPPORT_LEGACY_CHAT` feature flag (default: enabled).
- tests: add jest -> vi compatibility shims; fix race-condition tests and vector service mocks.
- client: temporarily relax `@typescript-eslint/no-explicit-any` to allow incremental typing fixes; fixed ESLint issues in `ErrorBoundary`, `Sidebar`, and tests.
