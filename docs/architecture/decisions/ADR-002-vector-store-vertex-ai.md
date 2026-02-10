# ADR-002: Hybrid Vector Store Strategy

## Status

Accepted

## Context

We need a vector search system that supports metadata filters (department/role) and integrates with the GCP stack. It must be accessible for both lightweight local development ("Easy Mode") and enterprise-scale production ("Enterprise Mode").

## Decision

Implement a hybrid strategy:

1. **Easy Mode (Local)**: Use SQLite with `sqlite-vss` extension (or simple persistent JSON for MVP) to store and search vectors locally. Requires only a Gemini API Key.
2. **Enterprise Mode (Cloud)**: Use Vertex AI Vector Search for massive document sets and multi-region scalability.

## Alternatives Considered

1. **Vertex AI ONLY** — rejected due to high setup barrier for small teams.
2. **Open-source vector DB (e.g., Qdrant)** — rejected due to hosting overhead.

## Consequences

- Enables instant "5-minute setup" using Local Mode.
- Provides a clear migration path to Vertex AI as document volume grows.
- Requires maintenance of two search implementations in `VectorService`.
