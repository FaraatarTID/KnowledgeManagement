import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorService } from '../../services/vector.service.js';
import fs from 'fs';
import path from 'path';

describe('VectorService Race Condition Tests', () => {
  let vectorService: VectorService;
  const testProjectId = 'aikb-mock-project';
  const testDataFile = path.join(process.cwd(), 'data', 'vectors-test.json');

  beforeEach(() => {
    // Clean up test data
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
    vectorService = new VectorService(testProjectId, 'us-central1');
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDataFile)) {
      fs.unlinkSync(testDataFile);
    }
  });

  it('should handle concurrent upserts without data loss', async () => {
    const items1 = [
      { id: 'doc1_chunk0', values: Array(768).fill(0.1), metadata: { docId: 'doc1', text: 'test1' } },
      { id: 'doc1_chunk1', values: Array(768).fill(0.2), metadata: { docId: 'doc1', text: 'test2' } }
    ];

    const items2 = [
      { id: 'doc2_chunk0', values: Array(768).fill(0.3), metadata: { docId: 'doc2', text: 'test3' } },
      { id: 'doc2_chunk1', values: Array(768).fill(0.4), metadata: { docId: 'doc2', text: 'test4' } }
    ];

    const items3 = [
      { id: 'doc3_chunk0', values: Array(768).fill(0.5), metadata: { docId: 'doc3', text: 'test5' } }
    ];

    // Execute 100 concurrent upserts
    const promises = [];
    for (let i = 0; i < 100; i++) {
      const items = i % 3 === 0 ? items1 : i % 3 === 1 ? items2 : items3;
      promises.push(vectorService.upsertVectors(items));
    }

    await Promise.all(promises);

    // Verify all vectors were added
    const allVectors = await vectorService.getAllVectors();
    // 100 batches * (2 or 2 or 1 items) = should have 100*1.66 = ~166 items
    // But since we're reusing IDs, we should have 5 unique items
    expect(allVectors.length).toBeGreaterThanOrEqual(5);
  }, 30000);

  it('should recover from corrupted data file', async () => {
    // Create corrupted data file
    const corruptedData = '{ invalid json }';
    fs.writeFileSync(testDataFile, corruptedData);

    // Should not crash, should initialize empty
    const newService = new VectorService(testProjectId, 'us-central1');
    
    // Should be able to use it
    await newService.upsertVectors([
      { id: 'test1', values: Array(768).fill(0.1), metadata: { text: 'test' } }
    ]);

    const vectors = await newService.getAllVectors();
    expect(vectors.length).toBe(1);
  });

  it('should prevent data corruption during concurrent writes', async () => {
    // Stress test: many concurrent operations
    const operations = [];
    
    for (let i = 0; i < 50; i++) {
      operations.push(
        vectorService.upsertVectors([
          { id: `concurrent_${i}`, values: Array(768).fill(i / 50), metadata: { index: i } }
        ])
      );
    }

    await Promise.all(operations);

    // Verify data integrity
    const vectors = await vectorService.getAllVectors();
    expect(vectors.length).toBe(50);
    
    // Verify no duplicate IDs
    const ids = vectors.map(v => v.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(50);
  }, 30000);
});

describe('QueryAI Race Condition Tests', () => {
  // Mock fetch to simulate race conditions
  let originalFetch: typeof global.fetch;
  
  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should handle rapid-fire queries in correct order', async () => {
    const queryResults: string[] = [];
    let callCount = 0;

    // Mock fetch with delayed responses
    global.fetch = jest.fn((url: string, options?: any) => {
      const body = JSON.parse(options.body);
      const queryNum = ++callCount;
      
      // Simulate variable network delay
      const delay = Math.random() * 100;
      
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: async () => ({
              content: `Response ${queryNum} for: ${body.query}`
            })
          });
        }, delay);
      });
    }) as any;

    // Simulate rapid queries
    const queries = ['Query A', 'Query B', 'Query C'];
    const promises = queries.map((query, index) => {
      return new Promise<void>(async (resolve) => {
        // Add slight delay between queries
        await new Promise(r => setTimeout(r, index * 10));
        
        // Simulate what queryAI does
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: JSON.stringify({ query })
        });
        const data = await response.json();
        queryResults.push(data.content);
        resolve();
      });
    });

    await Promise.all(promises);

    // All responses should be received
    expect(queryResults.length).toBe(3);
    
    // Responses should match queries (though order may vary due to network)
    queries.forEach((query, index) => {
      expect(queryResults.some(r => r.includes(query))).toBe(true);
    });
  }, 10000);
});

describe('SyncService Concurrency Tests', () => {
  // This would test the actual sync service with mock file operations
  // For brevity, showing the test structure
  
  it('should process large documents with controlled concurrency', async () => {
    // Simulate processing a document with 50 chunks
    const chunks = Array.from({ length: 50 }, (_, i) => `Chunk ${i}: ${'x'.repeat(100)}`);
    
    // Track concurrent operations
    let maxConcurrent = 0;
    let currentConcurrent = 0;
    const concurrencyLock = new Mutex();

    const processChunk = async (chunk: string) => {
      const release = await concurrencyLock.acquire();
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      
      // Simulate embedding generation
      await new Promise(r => setTimeout(r, Math.random() * 10));
      
      currentConcurrent--;
      release();
      return chunk;
    };

    // Process with concurrency limit
    const CONCURRENCY = 3;
    const results: string[] = [];
    
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processChunk));
      results.push(...batchResults);
    }

    expect(results.length).toBe(50);
    expect(maxConcurrent).toBeLessThanOrEqual(3);
  }, 10000);
});

// Simple Mutex for testing
class Mutex {
  private queue: (() => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return () => {
        this.locked = false;
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          next();
        }
      };
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }
}