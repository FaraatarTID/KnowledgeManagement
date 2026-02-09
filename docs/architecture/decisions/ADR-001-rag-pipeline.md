# ADR-001: Retrieval-Augmented Generation (RAG) Pipeline

## Status
Accepted

## Context
We need a reliable approach to answer user questions grounded in internal documents while controlling cost and hallucinations.

## Decision
Implement a RAG pipeline that:
- Embeds the query.
- Performs RBAC-filtered vector search.
- Builds a bounded context window.
- Runs the LLM call with cost checks.
- Validates responses with hallucination checks and citations.

## Alternatives Considered
1. **Pure LLM without retrieval** — rejected due to hallucination risk.
2. **Keyword-only search** — rejected due to weak semantic relevance.

## Consequences
- Requires maintaining a vector store and embeddings.
- Adds latency but provides grounded answers and better safety.
