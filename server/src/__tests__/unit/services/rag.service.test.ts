import { describe, it, expect } from 'vitest';
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
});
