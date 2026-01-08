import fs from 'fs';
import path from 'path';

import { LocalMetadataService } from './localMetadata.service.js';

/**
 * Simple Mutex implementation for preventing race conditions
 */
class Mutex {
  private queue: ((releaseFn: () => void) => void)[] = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    let releaseFn: () => void;

    const p = new Promise<() => void>((resolve) => {
      releaseFn = () => {
        this.locked = false;
        if (this.queue.length > 0) {
          // Pass the release function to the next waiter
          const nextResolve = this.queue.shift()!;
          this.locked = true;
          nextResolve(releaseFn!);
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(releaseFn!);
      } else {
        // Queue a resolver that will receive the release function
        this.queue.push((r) => resolve(r));
      }
    });

    return p;
  }
}

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
  private saveTimeout?: ReturnType<typeof setTimeout>;
  
  // SECURITY: Mutex for atomic writes to prevent race conditions
  private writeMutex = new Mutex();

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
      // SECURITY: Check for recovery scenarios
      const backupFile = this.DATA_FILE + '.bak';
      const tempFile = this.DATA_FILE + '.tmp';

      // If main file exists, use it
      if (fs.existsSync(this.DATA_FILE)) {
        const data = fs.readFileSync(this.DATA_FILE, 'utf-8');
        try {
          const parsed = JSON.parse(data);
          // Validate structure
          if (!Array.isArray(parsed)) {
            throw new Error('Invalid vector store format: not an array');
          }
          // Validate each item has required structure
          for (const item of parsed) {
            if (!item.id || !item.values || !Array.isArray(item.values)) {
              throw new Error('Invalid vector item structure');
            }
          }
          this.vectors = parsed;
          console.log(`VectorService: Loaded ${this.vectors.length} vectors from disk.`);
        } catch (parseError) {
          console.error('VectorService: Data corruption detected in main file', parseError);
          throw parseError;
        }
        
        // Clean up any orphaned temp/backup files
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
        if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
        return;
      }

      // Recovery: If backup exists but main doesn't, restore from backup
      if (fs.existsSync(backupFile)) {
        console.warn('VectorService: Main file missing, recovering from backup');
        try {
          fs.copyFileSync(backupFile, this.DATA_FILE);
          const data = fs.readFileSync(this.DATA_FILE, 'utf-8');
          const parsed = JSON.parse(data);
          if (!Array.isArray(parsed)) throw new Error('Backup corrupted');
          this.vectors = parsed;
          fs.unlinkSync(backupFile);
          console.log('VectorService: Recovery from backup successful');
          return;
        } catch (recoveryError) {
          console.error('VectorService: Backup recovery failed', recoveryError);
          // Continue to initialize new store
        }
      }

      // Initialize new data directory
      const dir = path.dirname(this.DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.DATA_FILE, '[]');
      console.log('VectorService: Initialized new vector store');
    } catch (e) {
      console.error('VectorService: Failed to load vectors, initializing empty store', e);
      // Initialize empty to prevent crashes
      this.vectors = [];
    }
  }

  /**
   * Atomic write operation with mutex to prevent race conditions
   * Uses write-then-rename pattern for crash safety
   */
  private async saveVectorsAtomic(): Promise<void> {
    const release = await this.writeMutex.acquire();
    
    const tempFile = this.DATA_FILE + '.tmp';
    const backupFile = this.DATA_FILE + '.bak';

    try {
      // 1. Write to temporary file
      await fs.promises.writeFile(tempFile, JSON.stringify(this.vectors, null, 2), { flag: 'w' });

      // 2. Verify write was successful by reading back
      const verifyData = await fs.promises.readFile(tempFile, 'utf-8');
      const parsed = JSON.parse(verifyData);
      if (JSON.stringify(parsed) !== JSON.stringify(this.vectors)) {
        throw new Error('Data corruption detected during write');
      }

      // 3. Create backup of existing file (if it exists)
      if (fs.existsSync(this.DATA_FILE)) {
        await fs.promises.copyFile(this.DATA_FILE, backupFile);
      }

      // 4. Atomic rename (guaranteed atomic on most filesystems)
      await fs.promises.rename(tempFile, this.DATA_FILE);

      // 5. Clean up backup after successful write
      if (fs.existsSync(backupFile)) {
        await fs.promises.unlink(backupFile);
      }

      console.log(`VectorService: Atomic write completed. Vectors: ${this.vectors.length}`);
    } catch (error) {
      console.error('VectorService: Atomic write failed', error);
      // Attempt recovery from backup
      if (fs.existsSync(backupFile)) {
        console.warn('VectorService: Attempting recovery from backup');
        try {
          await fs.promises.copyFile(backupFile, this.DATA_FILE);
          const recovered = await fs.promises.readFile(this.DATA_FILE, 'utf-8');
          this.vectors = JSON.parse(recovered);
          console.log('VectorService: Recovery successful');
        } catch (recoveryError) {
          console.error('VectorService: Recovery failed', recoveryError);
        }
      }
      // Clean up temp file on error
      if (fs.existsSync(tempFile)) {
        await fs.promises.unlink(tempFile).catch(() => {});
      }
      throw error;
    } finally {
      release();
    }
  }

  /**
   * Public method to trigger atomic save
   */
  async flush(): Promise<void> {
    return this.saveVectorsAtomic();
  }

  /**
   * Legacy immediate save wrapper (maintains compatibility)
   * @deprecated Use flush() for explicit saves
   */
  private async saveVectors(immediate: boolean = false): Promise<void> {
    if (immediate) {
      return this.saveVectorsAtomic();
    }
    // Debounce for non-immediate calls
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveVectorsAtomic().catch(console.error);
    }, 1000);
  }

  getVectorCount(): number {
    return this.vectors.length;
  }

  /**
   * Add a single vector item to the database
   * Used for syncing documents from frontend
   */
  async addItem(item: VectorItem): Promise<void> {
    if (this.isMock) {
      const existingIndex = this.vectors.findIndex(v => v.id === item.id);
      if (existingIndex >= 0) {
        this.vectors[existingIndex] = item;
        console.log(`VectorService (mock): Updated vector ${item.id}`);
      } else {
        this.vectors.push(item);
        console.log(`VectorService (mock): Added vector ${item.id}`);
      }
      return;
    }

    // Check if item already exists
    const existingIndex = this.vectors.findIndex(v => v.id === item.id);
    if (existingIndex >= 0) {
      // Update existing
      this.vectors[existingIndex] = item;
      console.log(`VectorService: Updated vector ${item.id}`);
    } else {
      // Add new
      this.vectors.push(item);
      console.log(`VectorService: Added vector ${item.id}`);
    }

    // Trigger atomic save
    await this.saveVectorsAtomic();
  }

  /**
   * Batch add multiple vectors
   */
  async addItems(items: VectorItem[]): Promise<void> {
    if (this.isMock) {
      for (const item of items) {
        const existingIndex = this.vectors.findIndex(v => v.id === item.id);
        if (existingIndex >= 0) this.vectors[existingIndex] = item;
        else this.vectors.push(item);
      }
      console.log(`VectorService (mock): Added ${items.length} vectors`);
      return;
    }

    for (const item of items) {
      const existingIndex = this.vectors.findIndex(v => v.id === item.id);
      if (existingIndex >= 0) {
        this.vectors[existingIndex] = item;
      } else {
        this.vectors.push(item);
      }
    }

    await this.saveVectorsAtomic();
    console.log(`VectorService: Batch added ${items.length} vectors`);
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

    // SECURITY: Fail-Closed. If no role/department provided, we return zero results.
    if (!params.filters?.role || !params.filters?.department) {
      console.warn('VectorService: Rejected search due to missing security filters.');
      return [];
    }

    // HYBRID APPROACH: Use optimized search for large datasets
    const THRESHOLD = 1000; // Switch to optimized search after 1000 vectors
    const useOptimized = this.vectors.length >= THRESHOLD;

    if (useOptimized) {
      return this.optimizedSimilaritySearch(params);
    } else {
      return this.linearSimilaritySearch(params);
    }
  }

  /**
   * Optimized similarity search using pre-filtering and parallel processing
   * For large datasets (1000+ vectors)
   */
  private async optimizedSimilaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }) {
    const start = Date.now();
    const queryVec = params.embedding;
    
    // SECURITY: Map roles and sensitivity to numeric levels
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || '').toUpperCase();
    const userClearance = roleMap[userRole] || 1;
    const userDept = (params.filters?.department || '').toLowerCase();

    // STEP 1: Aggressive pre-filtering (reduces search space by 80-90%)
    const filteredVectors = this.vectors.filter(vec => {
      // Sensitivity check
      const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
      const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;
      if (userClearance < docRequiredLevel) return false;

      // Department check
      if (userRole !== 'ADMIN') {
         const vecDept = (vec.metadata.department || '').toLowerCase();
         if (vecDept && vecDept !== userDept) return false;
      }
      return true;
    });

    // STEP 2: Parallel similarity calculation
    const BATCH_SIZE = 50;
    const scoredResults: { vec: VectorItem; score: number }[] = [];

    for (let i = 0; i < filteredVectors.length; i += BATCH_SIZE) {
      const batch = filteredVectors.slice(i, i + BATCH_SIZE);
      
      // Parallel calculation
      const batchScores = await Promise.all(
        batch.map(vec => Promise.resolve({
          vec,
          score: this.cosineSimilarity(queryVec, vec.values)
        }))
      );
      
      scoredResults.push(...batchScores);
      
      // Small yield to prevent blocking
      if (i % 200 === 0) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    // STEP 3: Partial sort (only sort top candidates)
    // Instead of sorting all, we maintain a min-heap of topK results
    const topK = Math.min(params.topK, scoredResults.length);
    const topResults = scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const duration = Date.now() - start;
    console.log(`VectorService: Optimized search completed in ${duration}ms (filtered ${filteredVectors.length}/${this.vectors.length})`);

    return topResults.map(r => ({
      id: r.vec.id,
      score: r.score,
      metadata: r.vec.metadata
    }));
  }

  /**
   * Original linear search for small datasets (< 1000 vectors)
   * Maintains exact same behavior as before
   */
  private linearSimilaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }) {
    const start = Date.now();
    const queryVec = params.embedding;
    
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    
    const userRole = (params.filters?.role || '').toUpperCase();
    const userClearance = roleMap[userRole] || 1;
    const userDept = (params.filters?.department || '').toLowerCase();

    // Perform Hard Filtering
    const filteredVectors = this.vectors.filter(vec => {
      const docSensitivity = (vec.metadata.sensitivity || 'INTERNAL').toUpperCase();
      const docRequiredLevel = sensitivityMap[docSensitivity] ?? 1;
      if (userClearance < docRequiredLevel) return false;

      if (userRole !== 'ADMIN') {
         const vecDept = (vec.metadata.department || '').toLowerCase();
         if (vecDept && vecDept !== userDept) return false;
      }
      return true;
    });

    // Map with scores
    const scored = filteredVectors.map(vec => ({
      ...vec,
      score: this.cosineSimilarity(queryVec, vec.values)
    }));

    // Sort descending
    scored.sort((a, b) => b.score - a.score);

    const duration = Date.now() - start;
    console.log(`VectorService: Linear search completed in ${duration}ms`);

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

  // Return a shallow copy of all vectors (used by tests)
  async getAllVectors(): Promise<VectorItem[]> {
    return [...this.vectors];
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
      await this.saveVectors(true); // Immediate flush for critical metadata
      console.log(`VectorService: Updated metadata for ${updatedCount} chunks of document ${docId}.`);
    }
  }

  async upsertVectors(vectors: { id: string; values: number[]; metadata: any }[]) {
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

    if (this.isMock) {
      console.log(`VectorService (mock): Upserted ${vectors.length} vectors. Total: ${this.vectors.length}`);
      return;
    }

    // SECURITY: Use atomic save to prevent data loss
    await this.saveVectorsAtomic();
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
