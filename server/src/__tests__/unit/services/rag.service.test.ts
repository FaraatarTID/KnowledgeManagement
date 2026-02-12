import { describe, it, expect, vi } from 'vitest';
import { RAGService } from '../../../services/rag.service.js';
import { REQUEST_TIMEOUTS } from '../../../utils/timeout.util.js';

class MockGeminiService {
  async generateEmbedding() {
    return [0.1, 0.2, 0.3];
  }

  async queryKnowledgeBase() {
    return {
      text: JSON.stringify({
        answer: 'ok',
        confidence: 'Low',
        citations: [],
        missing_information: 'None'
      }),
      usageMetadata: undefined
    };
  }
}

class MockVectorService {
  async similaritySearch() {
    return [];
  }
}

describe('RAGService timeout budget helper', () => {
  it('caps remaining budget at RAG_QUERY timeout', () => {
    const rag = new RAGService(new MockGeminiService() as any, new MockVectorService() as any) as any;
    const farFutureDeadline = Date.now() + REQUEST_TIMEOUTS.RAG_QUERY * 5;

    const remaining = rag.remainingBudgetMs(farFutureDeadline);

    expect(remaining).toBe(REQUEST_TIMEOUTS.RAG_QUERY);
  });

  it('returns minimum positive floor when deadline is in the past', () => {
    const rag = new RAGService(new MockGeminiService() as any, new MockVectorService() as any) as any;
    const expiredDeadline = Date.now() - 500;

    const remaining = rag.remainingBudgetMs(expiredDeadline);

    expect(remaining).toBe(100);
  });

  it('redacts query text before writing audit logs', async () => {
    const rag = new RAGService(new MockGeminiService() as any, new MockVectorService() as any) as any;
    const log = vi.fn().mockResolvedValue(undefined);
    rag.auditService = { log };

    await rag.query({
      query: 'Contact me at john.doe@example.com',
      userId: 'u-1',
      userProfile: { name: 'User', department: 'IT', role: 'VIEWER' }
    });

    expect(log).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('[EMAIL REDACTED]')
    }));
  });

  it('fails loud when query processing throws internal errors', async () => {
    const brokenVector = {
      similaritySearch: async () => {
        throw new Error('vector unavailable');
      }
    };
    const rag = new RAGService(new MockGeminiService() as any, brokenVector as any) as any;
    rag.auditService = { log: vi.fn().mockResolvedValue(undefined) };

    await expect(rag.query({
      query: 'hello',
      userId: 'u-1',
      userProfile: { name: 'User', department: 'IT', role: 'VIEWER' }
    })).rejects.toThrow('RAG_QUERY_FAILED');
  });

  it('keeps truncated content inside token budget', () => {
    const rag = new RAGService(new MockGeminiService() as any, new MockVectorService() as any) as any;
    const hugeText = 'a '.repeat(5000);
    const budget = 20;

    const truncated = rag.truncateToTokenBudget(hugeText, budget);
    expect(rag.countTokens(truncated)).toBeLessThanOrEqual(budget);
  });
});
