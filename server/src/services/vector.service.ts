import fs from 'fs';
import path from 'path';
import { LocalMetadataService } from './localMetadata.service.js';
import { JSONStore } from '../utils/jsonStore.js';

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
  private isMock: boolean = false;
  private localMetadataService: LocalMetadataService;
  private store: JSONStore<VectorItem[]>;
  private storagePath: string;

  constructor(private projectId: string, private location: string, storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), 'data', 'vectors.json');
    this.localMetadataService = new LocalMetadataService();
    this.store = new JSONStore(this.storagePath, []);
    
    if (projectId.includes('mock')) {
       this.isMock = true;
       console.log('VectorService initialized in MOCK MODE.');
    }
  }

  getVectorCount(): number {
    return this.store.state.length;
  }

  async flush(): Promise<void> {
    await this.store.update(c => c);
  }

  async addItem(item: VectorItem): Promise<void> {
    if (this.isMock) {
      await this.store.update(v => {
        const idx = v.findIndex(x => x.id === item.id);
        if (idx >= 0) v[idx] = item; else v.push(item);
        return v;
      });
      return;
    }

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
    if (this.isMock) {
       return [
         { id: 'mock-chunk-1', score: 0.95, metadata: { docId: 'd1', title: 'Security Policy 2024', text: 'Mock result regarding security policy...' } },
         { id: 'mock-chunk-2', score: 0.88, metadata: { docId: 'd2', title: 'Product Specs v2', text: 'Another mock result...' } }
       ];
    }

    if (!params.filters?.role || !params.filters?.department) {
      console.warn('VectorService: Rejected search due to missing security filters.');
      return [];
    }

    const vectors = this.store.state;
    const THRESHOLD = 1000;
    const useOptimized = vectors.length >= THRESHOLD;

    if (useOptimized) {
      return this.optimizedSimilaritySearch(params, vectors);
    } else {
      return this.linearSimilaritySearch(params, vectors);
    }
  }

  private async optimizedSimilaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }, vectors: VectorItem[]) {
    const start = Date.now();
    const queryVec = params.embedding;
    
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || '').toUpperCase();
    const userClearance = roleMap[userRole] || 1;
    const userDept = (params.filters?.department || '').toLowerCase();

    const filteredVectors = vectors.filter(vec => {
      const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
      const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;
      
      // 1. Sensitivity Clearance Check
      if (userClearance < docRequiredLevel) return false;

      // 2. Department Isolation (Strict Deny)
      if (userRole !== 'ADMIN') {
         const vecDept = (vec.metadata.department || '').toLowerCase();
         const userDeptNormal = userDept.toLowerCase();

         // Only allow if:
         // - Department matches exactly
         // - OR document is explicitly 'public' or 'general' (if intended)
         // FOR NOW: Strict match for production isolation.
         if (vecDept !== userDeptNormal && vecDept !== 'general' && vecDept !== 'public') {
             return false;
         }
      }
      return true;
    });

    const BATCH_SIZE = 50;
    const scoredResults: { vec: VectorItem; score: number }[] = [];

    for (let i = 0; i < filteredVectors.length; i += BATCH_SIZE) {
      const batch = filteredVectors.slice(i, i + BATCH_SIZE);
      const batchScores = await Promise.all(
        batch.map(vec => Promise.resolve({
          vec,
          score: this.cosineSimilarity(queryVec, vec.values)
        }))
      );
      scoredResults.push(...batchScores);
      if (i % 200 === 0) await new Promise(resolve => setImmediate(resolve));
    }

    const topK = Math.min(params.topK, scoredResults.length);
    const topResults = scoredResults.sort((a, b) => b.score - a.score).slice(0, topK);

    console.log(`VectorService: Optimized search completed in ${Date.now() - start}ms`);
    return topResults.map(r => ({ id: r.vec.id, score: r.score, metadata: r.vec.metadata }));
  }

  private linearSimilaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }, vectors: VectorItem[]) {
    const start = Date.now();
    const queryVec = params.embedding;
    
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || '').toUpperCase();
    const userClearance = roleMap[userRole] || 1;
    const userDept = (params.filters?.department || '').toLowerCase();

    const filteredVectors = vectors.filter(vec => {
      const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
      const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;
      
      // 1. Sensitivity Clearance Check
      if (userClearance < docRequiredLevel) return false;

      // 2. Department Isolation (Strict Deny)
      if (userRole !== 'ADMIN') {
         const vecDept = (vec.metadata.department || '').toLowerCase();
         const userDeptNormal = userDept.toLowerCase();

         if (vecDept !== userDeptNormal && vecDept !== 'general' && vecDept !== 'public') {
             return false;
         }
      }
      return true;
    });

    const scored = filteredVectors.map(vec => ({
      ...vec,
      score: this.cosineSimilarity(queryVec, vec.values)
    }));

    scored.sort((a, b) => b.score - a.score);
    console.log(`VectorService: Linear search completed in ${Date.now() - start}ms`);
    return scored.slice(0, params.topK);
  }

  async deleteDocument(docId: string) {
    if (this.isMock) return;
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
    if (this.isMock) return;
    
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
    if (this.isMock) {
       await this.addItems(vectors as any);
       return;
    }

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
    if (this.isMock) return { status: 'OK', message: 'Mock Mode' };
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
