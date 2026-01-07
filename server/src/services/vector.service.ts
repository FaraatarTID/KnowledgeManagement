import fs from 'fs';
import path from 'path';

import { LocalMetadataService } from './localMetadata.service.js';

interface VectorItem {
  id: string;
  values: number[];
  metadata: {
    docId: string;
    title: string;
    text: string;
    link?: string;
    [key: string]: any;
  };
}

export class VectorService {
  private isMock: boolean = false;
  private vectors: VectorItem[] = [];
  private readonly DATA_FILE = path.join(process.cwd(), 'data', 'vectors.json');
  private localMetadataService: LocalMetadataService;

  constructor(private projectId: string, private location: string) {
    this.localMetadataService = new LocalMetadataService();
    if (projectId.includes('mock')) {
       this.isMock = true;
       console.log('VectorService initialized in MOCK MODE.');
    } else {
       this.loadVectors();
    }
  }

  private loadVectors() {
    try {
      if (fs.existsSync(this.DATA_FILE)) {
        const data = fs.readFileSync(this.DATA_FILE, 'utf-8');
        this.vectors = JSON.parse(data);
        console.log(`VectorService: Loaded ${this.vectors.length} vectors from disk.`);
      } else {
        // Ensure data dir exists
        const dir = path.dirname(this.DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.DATA_FILE, '[]');
      }
    } catch (e) {
      console.error('VectorService: Failed to load vectors', e);
    }
  }

  // Debounce save operation to prevent hitting disk on every chunk
  private saveTimeout: NodeJS.Timeout | null = null;

  private async saveVectors() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);

    this.saveTimeout = setTimeout(async () => {
      try {
        await fs.promises.writeFile(this.DATA_FILE, JSON.stringify(this.vectors, null, 2));
      } catch (e) {
        console.error('VectorService: Failed to save vectors', e);
      }
    }, 1000) as unknown as NodeJS.Timeout; // 1 second debounce
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

    // Perform exact Cosine Similarity
    const queryVec = params.embedding;
    
    // Map with scores
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || 'VIEWER').toUpperCase();
    const userClearance = roleMap[userRole] || 1;

    // Filter first
    let filteredVectors = this.vectors;
    if (params.filters) {
      filteredVectors = this.vectors.filter(vec => {
        // 1. Sensitivity Clearance Check
        const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
        const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;

        if (userClearance < docRequiredLevel) {
          return false;
        }

        // 2. Department check (Admins bypass department check)
        if (userRole !== 'ADMIN' && vec.metadata.department && params.filters?.department) {
           const vecDept = vec.metadata.department.toLowerCase();
           const userDept = params.filters.department.toLowerCase();
           
           if (vecDept !== userDept) {
             return false;
           }
        }
        return true;
      });
    }

    // Map with scores
    const scored = filteredVectors.map(vec => {
      return {
        ...vec,
        score: this.cosineSimilarity(queryVec, vec.values)
      };
    });

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    // Take top K
    return scored.slice(0, params.topK);
  }

  async deleteDocument(docId: string) {
    if (this.isMock) return;
    this.vectors = this.vectors.filter(v => v.metadata.docId !== docId);
    await this.saveVectors();
    console.log(`VectorService: Deleted all chunks for document ${docId}.`);
  }

  async getAllMetadata(): Promise<Record<string, { category?: string; sensitivity?: string; department?: string; title?: string; owner?: string; link?: string }>> {
    const metaMap: Record<string, any> = {};
    this.vectors.forEach(v => {
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

  async updateDocumentMetadata(docId: string, metadata: { title?: string; category?: string; sensitivity?: string; department?: string }) {
    if (this.isMock) return;
    
    // Save to local metadata overrides to ensure it's "sticky" through syncs
    this.localMetadataService.setOverride(docId, metadata);

    let updatedCount = 0;
    this.vectors = this.vectors.map(v => {
      if (v.metadata.docId === docId) {
        updatedCount++;
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

    if (updatedCount > 0) {
      await this.saveVectors();
      console.log(`VectorService: Updated metadata for ${updatedCount} chunks of document ${docId}.`);
    }
  }

  async upsertVectors(vectors: { id: string; values: number[]; metadata: any }[]) {
    if (this.isMock) return;
    
    // Remove existing vectors with same ID (upsert behavior)
    const newIds = new Set(vectors.map(v => v.id));
    this.vectors = this.vectors.filter(v => !newIds.has(v.id));
    
    // Add new ones
    // Cast to VectorItem structure (ensure metadata aligns)
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

    this.vectors.push(...newItems);
    
    // Persist
    await this.saveVectors();
    console.log(`VectorService: Upserted ${vectors.length} vectors. Total: ${this.vectors.length}`);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;
    
    let dot = 0;
    let normA = 0;
    let normB = 0;
    
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
      if (fs.existsSync(this.DATA_FILE)) {
        return { status: 'OK', message: `${this.vectors.length} vectors` };
      }
      return { status: 'ERROR', message: 'Data file missing' };
    } catch (e: any) {
      return { status: 'ERROR', message: e.message };
    }
  }
}
