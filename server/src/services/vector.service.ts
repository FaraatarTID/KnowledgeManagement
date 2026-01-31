import fs from 'fs';
import path from 'path';
import { LocalMetadataService } from './localMetadata.service.js';
import { JSONStore } from '../utils/jsonStore.js';
import { TopKHeap } from '../utils/heap.js';

interface VectorItem {
  id: string;
  values: number[];
  metadata: {
    docId: string;
    title: string;
    text: string;
    link?: string;
    sensitivity?: string;
    department?: string;
    category?: string;
    owner?: string;
    [key: string]: any;
  };
}

export class VectorService {
  private localMetadataService: LocalMetadataService;
  private store: JSONStore<VectorItem[]>;
  private storagePath: string;

  constructor(private projectId: string, private location: string, storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), 'data', 'vectors.json');
    this.localMetadataService = new LocalMetadataService();
    this.store = new JSONStore(this.storagePath, []);
  }

  getVectorCount(): number {
    return this.store.state.length;
  }

  async flush(): Promise<void> {
    await this.store.update(c => c);
  }

  async addItem(item: VectorItem): Promise<void> {
    await this.store.update(current => {
      const idx = current.findIndex(v => v.id === item.id);
      if (idx >= 0) current[idx] = item; else current.push(item);
      return current;
    });
  }

  async addItems(items: VectorItem[]): Promise<void> {
    await this.store.update(current => {
      items.forEach(item => {
        const idx = current.findIndex(v => v.id === item.id);
        if (idx >= 0) current[idx] = item; else current.push(item);
      });
      return current;
    });
  }

  async similaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string; [key: string]: any };
  }) {
    if (!params.filters?.role || !params.filters?.department) {
      console.warn('VectorService: Rejected search due to missing security filters.');
      return [];
    }

    const vectors = this.store.state;
    // PERFORMANCE: Use O(N log K) heap-based search for all queries
    return this.efficientSimilaritySearch(params, vectors);
  }

  private async efficientSimilaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }, vectors: VectorItem[]) {
    const start = Date.now();
    const queryVec = params.embedding;
    
    // Authorization matrices
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || '').toUpperCase();
    const userClearance = roleMap[userRole] || 1;
    const userDept = (params.filters?.department || '').toLowerCase();

    // PERFORMANCE: Use Min-Heap for Top-K selection (O(N log K))
    const heap = new TopKHeap<VectorItem>(params.topK);
    const BATCH_SIZE = 100;

    for (let i = 0; i < vectors.length; i++) {
      const vec = vectors[i]!;
      
      // 1. Mandatory Security Filter (Fail-Fast)
      const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
      const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;
      
      if (userClearance < docRequiredLevel) continue;

      if (userRole !== 'ADMIN') {
         const vecDept = (vec.metadata.department || '').toLowerCase();
         if (vecDept !== userDept && vecDept !== 'general' && vecDept !== 'public') continue;
      }

      // 2. Similarity Computation
      const score = this.cosineSimilarity(queryVec, vec.values);
      heap.add(score, vec);

      // 3. Voluntary Event Loop Yielding (Prevent blocking on massive datasets)
      if (i > 0 && i % BATCH_SIZE === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    const results = heap.getResults();
    console.log(`VectorService: Efficient search (N=${vectors.length}, K=${params.topK}) completed in ${Date.now() - start}ms`);
    return results.map(r => ({ id: r.item.id, score: r.score, metadata: r.item.metadata }));
  }

  async deleteDocument(docId: string) {
    await this.store.update(current => {
       return current.filter(v => v.metadata.docId !== docId);
    });
    console.log(`VectorService: Deleted document ${docId}.`);
  }

  async getAllMetadata(): Promise<Record<string, { category?: string; sensitivity?: string; department?: string; title?: string; owner?: string; link?: string }>> {
    const metaMap: Record<string, any> = {};
    this.store.state.forEach(v => {
      if (v.metadata.docId && !metaMap[v.metadata.docId]) {
        metaMap[v.metadata.docId] = {
          category: v.metadata.category,
          sensitivity: v.metadata.sensitivity,
          department: v.metadata.department,
          title: v.metadata.title,
          owner: v.metadata.owner,
          link: v.metadata.link
        };
      }
    });
    return metaMap;
  }

  async getAllVectors(): Promise<VectorItem[]> {
    return this.store.state;
  }

  async updateDocumentMetadata(docId: string, metadata: { title?: string; category?: string; sensitivity?: string; department?: string }) {
    await this.localMetadataService.setOverride(docId, metadata);

    await this.store.update(current => {
      return current.map(v => {
        if (v.metadata.docId === docId) {
          return {
            ...v,
            metadata: {
              ...v.metadata,
              ...metadata
            }
          };
        }
        return v;
      });
    });
    console.log(`VectorService: Updated metadata for document ${docId}.`);
  }

  async upsertVectors(vectors: { id: string; values: number[]; metadata: any }[]) {
    await this.store.update(current => {
      const newIds = new Set(vectors.map(v => v.id));
      const filtered = current.filter(v => !newIds.has(v.id));

      const newItems: VectorItem[] = vectors.map(v => ({
        id: v.id,
        values: v.values,
        metadata: {
          docId: v.metadata.docId,
          title: v.metadata.title || 'Untitled',
          text: v.metadata.text || '',
          link: v.metadata.link,
          ...v.metadata
        }
      }));

      filtered.push(...newItems);
      return filtered;
    });
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i]! * vecB[i]!;
        normA += vecA[i]! * vecA[i]!;
        normB += vecB[i]! * vecB[i]!;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    try {
      if (fs.existsSync(this.storagePath)) {
        return { status: 'OK', message: `${this.store.state.length} vectors` };
      }
      return { status: 'ERROR', message: 'Data file missing' };
    } catch (e: any) {
      return { status: 'ERROR', message: e.message };
    }
  }
}
