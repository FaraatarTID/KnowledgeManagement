# ADR-002: Vector Store on Vertex AI

## Status
Accepted

## Context
We need a scalable vector search system that supports metadata filters (department/role) and integrates with the GCP stack already used for document access.

## Decision
Use Vertex AI Vector Search as the primary vector store. Store minimal local metadata as a fallback and for operational visibility.

## Alternatives Considered
1. **Local JSON vector store** — rejected for large-scale performance.
2. **Open-source vector DB (e.g., FAISS, Qdrant)** — rejected due to hosting overhead.

## Consequences
- Requires GCP credentials and Vertex AI API availability.
- Enables RBAC filtering at the vector search API level.
