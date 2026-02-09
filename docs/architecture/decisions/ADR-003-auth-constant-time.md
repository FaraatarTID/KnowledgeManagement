# ADR-003: Constant-Time Authentication & Lockout

## Status
Accepted

## Context
Authentication must resist timing attacks and brute-force attempts while remaining operable in production.

## Decision
Implement constant-time authentication that:
- Adds jitter before any work.
- Enforces a minimum execution time (500ms).
- Always verifies a hash (real or dummy).
- Locks accounts after repeated failures.

## Alternatives Considered
1. **Default bcrypt only** — rejected due to timing differences on missing users.
2. **IP-only rate limiting** — rejected due to shared proxies and bypass risk.

## Consequences
- Adds small latency to login requests.
- Improves resilience against timing and brute-force attacks.
