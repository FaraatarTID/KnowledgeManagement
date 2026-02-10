import { describe, expect, it } from 'vitest';
import { GeminiService } from '../../../services/gemini.service.js';

describe('GeminiService embedding model strategy', () => {
  it('builds AI Studio embedding fallback candidates with deduplication', () => {
    const service = new GeminiService('fake-key', 'us-central1', true) as any;
    const candidates = service.buildEmbeddingCandidates('gemini-embedding-001', true);

    expect(candidates).toEqual(['gemini-embedding-001', 'text-embedding-004', 'embedding-001']);
  });

  it('detects model-not-found errors for fallback behavior', () => {
    const service = new GeminiService('fake-key', 'us-central1', true) as any;

    expect(service.isModelNotFoundError(new Error('404 Not Found: model not supported for embedContent'))).toBe(true);
    expect(service.isModelNotFoundError(new Error('socket timeout'))).toBe(false);
  });
});
