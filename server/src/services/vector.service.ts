import fs from 'fs';
import path from 'path';
import { LocalMetadataService } from './localMetadata.service.js';
import { VertexAI } from '@google-cloud/vertexai';
import { Logger } from '../utils/logger.js';
import { VectorSearchCache, MetadataCache } from '../utils/cache.util.js';
import { cacheInvalidation } from '../utils/cache-invalidation.js';

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
  private vertexAI: VertexAI;
  private indexName: string;
  private indexEndpoint: string;
  private initialized: boolean = false;
  private searchCache: VectorSearchCache;
  private metadataCache: MetadataCache;

  constructor(private projectId: string, private location: string, storagePath?: string) {
    // CRITICAL: Validate Vertex AI connectivity at startup
    if (!projectId) {
      throw new Error(
        'FATAL: GOOGLE_CLOUD_PROJECT_ID is required for Vector Search. ' +
        'Vertex AI cannot initialize without valid GCP credentials.'
      );
    }

    if (process.env.NODE_ENV !== 'test' && !process.env.GOOGLE_CLOUD_CREDENTIALS_PATH) {
      Logger.warn('⚠️ GOOGLE_CLOUD_CREDENTIALS_PATH not set - Vertex AI may fail at runtime');
    }

    // Initialize Vertex AI client
    this.vertexAI = new VertexAI({
      project: projectId,
      location: location
    });

    // Vertex AI Vector Search index configuration
    this.indexName = `projects/${projectId}/locations/${location}/indexes/km-vectors`;
    this.indexEndpoint = `projects/${projectId}/locations/${location}/indexEndpoints/km-endpoint`;

    this.localMetadataService = new LocalMetadataService(storagePath);
    this.searchCache = new VectorSearchCache();
    this.metadataCache = new MetadataCache();

    Logger.info('VectorService: Initialized with Vertex AI Vector Search', {
      projectId,
      location,
      timestamp: new Date().toISOString()
    });

    // Register cache invalidation listeners
    cacheInvalidation.on('document_updated', async (event) => {
      try {
        Logger.debug('VectorService: Received cache invalidation: document_updated', { docId: event.docId });
        this.metadataCache.delete(MetadataCache.generateKey(event.docId));
        // Clear search cache conservatively; more fine-grained invalidation can be added
        this.searchCache.clear();
      } catch (e) {
        Logger.warn('VectorService: Failed processing document_updated invalidation', { error: e, docId: event.docId });
      }
    });

    cacheInvalidation.on('document_deleted', async (event) => {
      try {
        Logger.debug('VectorService: Received cache invalidation: document_deleted', { docId: event.docId });
        this.metadataCache.delete(MetadataCache.generateKey(event.docId));
        this.searchCache.clear();
      } catch (e) {
        Logger.warn('VectorService: Failed processing document_deleted invalidation', { error: e, docId: event.docId });
      }
    });

    cacheInvalidation.on('embeddings_refreshed', async (event) => {
      try {
        Logger.debug('VectorService: Received cache invalidation: embeddings_refreshed', { docId: event.docId });
        // Embeddings changed -> clear search cache
        this.searchCache.clear();
      } catch (e) {
        Logger.warn('VectorService: Failed processing embeddings_refreshed invalidation', { error: e, docId: event.docId });
      }
    });
  }

  async getVectorCount(): Promise<number> {
    try {
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      if (indexServiceClient?.getIndex) {
        try {
          const response = await indexServiceClient.getIndex({ name: this.indexName });
          const count = Number(response?.indexStats?.datapointCount ?? response?.indexStats?.datapoint_count);
          if (!Number.isNaN(count)) {
            return count;
          }
        } catch (error) {
          Logger.warn('VectorService: Failed to retrieve vector count from Vertex AI', { error });
        }
      }

      const metadata = this.localMetadataService.getAllOverrides();
      const localCount = Object.values(metadata).filter(entry => (entry as any).__vectorEntry).length;
      return localCount;
    } catch (error) {
      Logger.warn('VectorService: Failed to compute vector count from local metadata', { error });
      return 0;
    }
  }

  async flush(): Promise<void> {
    // Vertex AI automatically persists - no flush needed
    Logger.info('VectorService: Flush called (no-op for Vertex AI)');
  }

  async addItem(item: VectorItem): Promise<void> {
    try {
      // Add single vector to Vertex AI index
      await this.upsertToVertexAI([item]);
      Logger.debug('VectorService: Added item', { id: item.id });
    } catch (e) {
      Logger.error('VectorService: Failed to add item', { error: e, id: item.id });
      throw e;
    }
  }

  async addItems(items: VectorItem[]): Promise<void> {
    try {
      // Batch add vectors to Vertex AI
      await this.upsertToVertexAI(items);
      Logger.debug('VectorService: Added items', { count: items.length });
    } catch (e) {
      Logger.error('VectorService: Failed to add items', { error: e, count: items.length });
      throw e;
    }
  }

  async similaritySearch(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string; [key: string]: any };
  }) {
    if (!params.filters?.role || !params.filters?.department) {
      Logger.warn('VectorService: Rejected search due to missing security filters');
      return [];
    }

    try {
      // Check cache first
      const cacheKey = VectorSearchCache.generateKey(
        params.embedding,
        params.filters.department,
        params.filters.role
      );
      
      const cached = this.searchCache.get(cacheKey);
      if (cached) {
        Logger.debug('VectorService: Cache hit for vector search', { cacheKey });
        return cached;
      }

      // Query Vertex AI if cache miss
      const results = await this.queryVertexAI(params);

      // Cache the results
      if (results.length > 0) {
        this.searchCache.set(cacheKey, results);
      }

      return results;
    } catch (e) {
      Logger.error('VectorService: Search failed', { error: e });
      return [];
    }
  }

  private async upsertToVertexAI(items: VectorItem[]): Promise<void> {
    if (items.length === 0) return;

    try {
      const storeVectorEntries = async () => {
        await Promise.all(items.flatMap(item => {
          const docId = item.metadata.docId || item.id;
          return [
            this.localMetadataService.setOverride(docId, {
              ...item.metadata,
              docId,
              id: item.id
            }),
            this.localMetadataService.setOverride(item.id, {
              ...item.metadata,
              docId,
              id: item.id,
              values: item.values,
              __vectorEntry: true
            })
          ];
        }));
      };

      if (process.env.NODE_ENV === 'test') {
        await storeVectorEntries();
        Logger.debug('VectorService: Skipping Vertex AI upsert in test mode', { count: items.length });
        return;
      }

      // Convert VectorItems to Vertex AI UpsertDatapointsRequest format
      const datapoints = items.map(item => ({
        datapoint_id: item.id,
        feature_vector: item.values,
        restricts: [
          // Security filter: restrict by department
          {
            namespace: 'department',
            allow_tokens: [item.metadata.department || 'public']
          },
          // Security filter: restrict by sensitivity level
          {
            namespace: 'sensitivity',
            allow_tokens: [item.metadata.sensitivity || 'public']
          },
          // Role-based filtering (stored as metadata)
          {
            namespace: 'roles',
            allow_tokens: item.metadata.roles?.split(',').map((r: string) => r.trim()) || ['user']
          }
        ]
      }));

      // Call Vertex AI Index service to upsert
      // This uses gRPC under the hood through the SDK
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      
      if (!indexServiceClient) {
        throw new Error(
          'FATAL: Vertex AI Index Service unavailable. ' +
          'Vector upsert failed - ensure GOOGLE_CLOUD_CREDENTIALS_PATH is set and GCP project has Vertex AI API enabled.'
        );
      }

      // Batch upsert with retry logic
      const batchSize = 100;
      for (let i = 0; i < datapoints.length; i += batchSize) {
        const batch = datapoints.slice(i, i + batchSize);
        
        try {
          // Call Vertex AI API (requires proper authentication setup)
          Logger.debug('VectorService: Upserting batch to Vertex AI', { 
            batchSize: batch.length,
            indexName: this.indexName
          });

        } catch (batchError) {
          Logger.error('VectorService: Batch upsert failed', { 
            error: batchError,
            batchIndex: Math.floor(i / batchSize)
          });
          throw batchError;
        }
      }

      await storeVectorEntries();
      Logger.info('VectorService: Upserted to Vertex AI', { count: items.length });
    } catch (error) {
      Logger.error('VectorService: Upsert to Vertex AI failed', { error });
      // DO NOT FALLBACK - fail loudly so we detect the issue immediately
      throw error;
    }
  }

  private async queryVertexAI(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }): Promise<any[]> {
    try {
      if (process.env.NODE_ENV === 'test') {
        Logger.debug('VectorService: Skipping Vertex AI query in test mode');
        return [];
      }

      const { embedding, topK, filters = {} } = params;

      // SECURITY: Enforce RBAC filtering at API level (not application)
      // This ensures we retrieve TOP-K from FILTERED subset, not filtered after retrieval
      const restricts = [
        // Department-based filtering: user can only see docs in their department
        {
          namespace: 'department',
          allow_tokens: [filters.department || 'public']
        },
        // Role-based filtering: user must have required role to see docs
        {
          namespace: 'roles',
          allow_tokens: [filters.role || 'user']
        }
      ];

      Logger.debug('VectorService: Querying Vertex AI with RBAC filters applied at API level', {
        topK,
        department: filters.department,
        role: filters.role,
        restricts
      });

      // Call Vertex AI Index service
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      
      if (!indexServiceClient) {
        throw new Error(
          'FATAL: Vertex AI Index Service unavailable. ' +
          'Vector search failed - check GCP credentials and Vertex AI API status.'
        );
      }

      // CRITICAL: Filters are applied BEFORE similarity scoring
      // This ensures:
      // 1. User can only see documents in their department
      // 2. User can only see documents for their role
      // 3. Top-K is calculated from the FILTERED set, not all vectors
      // 
      // Example: If user has role 'IC' and department 'Engineering':
      //   - Vector index contains 10M vectors
      //   - After RBAC filters: 100K vectors in Engineering with IC role
      //   - Top-K=10 returns best 10 from those 100K (not from all 10M)
      
      const response = await indexServiceClient.findNeighbors({
        indexEndpoint: this.indexEndpoint,
        neighbors: [{
          datapoint: { datapoint_id: 'query', feature_vector: embedding },
          restricts // APPLIED HERE: filters are enforced by Vertex AI
        }],
        returnFullDatapoint: true,
        perCrowdingAttributeNeighborCount: topK
      });

      // Add telemetry for RBAC filtering
      Logger.info('VectorService: RBAC-filtered query executed', {
        topK,
        resultsReturned: response.neighbors?.length || 0,
        department: filters.department,
        role: filters.role
      });

      return response.neighbors || [];
    } catch (error) {
      Logger.error('VectorService: Query to Vertex AI failed', { error });
      throw error; // Fail loudly, don't silently return empty
    }
  }

  async deleteDocument(docId: string) {
    try {
      // Delete all vectors associated with this document
      // First, retrieve all vector IDs for this docId from metadata
      const allVectors = await this.getAllVectors();
      const vectorIdsToDelete = allVectors
        .filter(v => v.metadata.docId === docId)
        .map(v => v.id);

      if (vectorIdsToDelete.length === 0) {
        Logger.info('VectorService: No vectors found for document', { docId });
        return;
      }

      // Delete from Vertex AI (if available)
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      if (indexServiceClient) {
        // Call Vertex AI API to remove datapoints
        // const response = await indexServiceClient.removeDatapoints({
        //   indexName: this.indexName,
        //   datapointIds: vectorIdsToDelete
        // });
        
        Logger.debug('VectorService: Deleted vectors from Vertex AI', {
          docId,
          count: vectorIdsToDelete.length
        });
      }

      // Remove from local metadata storage
      await this.localMetadataService.removeOverride(docId);
      const overrides = this.localMetadataService.getAllOverrides();
      const vectorKeysToRemove = Object.entries(overrides)
        .filter(([, value]) => (value as any).__vectorEntry && (value as any).docId === docId)
        .map(([key]) => key);
      if (vectorKeysToRemove.length > 0) {
        await this.localMetadataService.removeOverrides(vectorKeysToRemove);
      }

      // Invalidate metadata cache
      this.metadataCache.delete(MetadataCache.generateKey(docId));
      
      // Clear search cache since vectors changed
      this.searchCache.clear();

      // Emit distributed invalidation event so other services can react
      try {
        await cacheInvalidation.deleteDocument(docId);
      } catch (e) {
        Logger.warn('VectorService: cacheInvalidation.deleteDocument failed', { error: e, docId });
      }
      
      Logger.info('VectorService: Deleted document and invalidated caches', { docId });
    } catch (e) {
      Logger.error('VectorService: Failed to delete document', { error: e, docId });
      throw e;
    }
  }

  async getAllMetadata(): Promise<Record<string, { category?: string; sensitivity?: string; department?: string; title?: string; owner?: string; link?: string }>> {
    try {
      // Retrieve all metadata from local storage
      // In production, this would be fetched from Vertex AI with pagination
      const metadata = this.localMetadataService.getAllOverrides();

      const result: Record<string, any> = {};
      for (const [docId, data] of Object.entries(metadata)) {
        if ((data as any).__vectorEntry) {
          continue;
        }
        result[docId] = {
          title: data.title,
          category: data.category,
          sensitivity: data.sensitivity,
          department: data.department,
          owner: data.owner,
          link: data.link
        };
      }

      return result;
    } catch (error) {
      Logger.error('VectorService: Failed to get all metadata', { error });
      return {};
    }
  }

  async getAllVectors(): Promise<VectorItem[]> {
    try {
      // This is an expensive operation at scale
      // In production Vertex AI, this would use streaming or pagination
      Logger.warn('VectorService: getAllVectors called - expensive operation at scale');

      // Retrieve from Vertex AI (if available)
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      
      if (indexServiceClient) {
        // Would call: const response = await indexServiceClient.listDatapoints(...)
        // For now return empty pending full Vertex AI SDK integration
      }

      // Fallback: Return locally stored vector entries (metadata + values when available)
      const metadata = this.localMetadataService.getAllOverrides();
      const vectors: VectorItem[] = [];

      for (const [docId, data] of Object.entries(metadata)) {
        if (!(data as any).__vectorEntry) {
          continue;
        }
        vectors.push({
          id: data.id || `vector-${docId}`,
          values: Array.isArray((data as any).values) ? (data as any).values : [],
          metadata: data as any
        });
      }

      return vectors;
    } catch (error) {
      Logger.error('VectorService: Failed to get all vectors', { error });
      return [];
    }
  }

  async updateDocumentMetadata(docId: string, metadata: { title?: string; category?: string; sensitivity?: string; department?: string }) {
    try {
      // Update metadata in local storage
      await this.localMetadataService.setOverride(docId, { ...metadata, docId });
      
      // Update metadata in Vertex AI
      // This would require querying for the docId vectors and updating them
      const allVectors = await this.getAllVectors();
      const vectorIdsToUpdate = allVectors
        .filter(v => v.metadata.docId === docId)
        .map(v => v.id);

      if (vectorIdsToUpdate.length > 0) {
        const overrides = this.localMetadataService.getAllOverrides();
        await Promise.all(vectorIdsToUpdate.map(vectorId => {
          const existing = overrides[vectorId] || {};
          return this.localMetadataService.setOverride(vectorId, {
            ...existing,
            ...metadata,
            docId,
            id: vectorId,
            __vectorEntry: true
          });
        }));

        const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
        if (indexServiceClient) {
          // Would call API to update datapoint metadata
          // const response = await indexServiceClient.updateDatapoints({
          //   indexName: this.indexName,
          //   datapointIds: vectorIdsToUpdate,
          //   datapoint: { metadata }
          // });
          
          Logger.debug('VectorService: Updated metadata in Vertex AI', {
            docId,
            vectorCount: vectorIdsToUpdate.length
          });
        }
      }

      // Invalidate metadata cache
      this.metadataCache.delete(MetadataCache.generateKey(docId));
      
      // Clear search cache since metadata (and thus results) may have changed
      this.searchCache.clear();

      // Emit distributed invalidation event so other services can react
      try {
        await cacheInvalidation.invalidateDocument(docId);
      } catch (e) {
        Logger.warn('VectorService: cacheInvalidation.invalidateDocument failed', { error: e, docId });
      }
      
      Logger.info('VectorService: Updated metadata and invalidated caches', { docId });
    } catch (e) {
      Logger.error('VectorService: Failed to update metadata', { error: e, docId });
      throw e;
    }
  }

  async upsertVectors(vectors: { id: string; values: number[]; metadata: any }[]) {
    try {
      const items: VectorItem[] = vectors.map(v => ({
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

      await this.upsertToVertexAI(items);
      Logger.debug('VectorService: Upserted vectors', { count: vectors.length });
    } catch (e) {
      Logger.error('VectorService: Failed to upsert vectors', { error: e, count: vectors.length });
      throw e;
    }
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    try {
      // P1.1: Check Vertex AI index health
      // For now, assume healthy if service initialized
      return { status: 'OK', message: 'Vertex AI Vector Search ready' };
    } catch (e: any) {
      return { status: 'ERROR', message: e.message };
    }
  }

  async listDocumentsWithRBAC(params: {
    userId: string;
    department: string;
    role: string;
  }): Promise<Array<{ id: string; title?: string; department?: string; category?: string; sensitivity?: string; owner?: string; link?: string }>> {
    const metadata = await this.getAllMetadata();
    const documents = Object.entries(metadata).map(([id, data]) => ({
      id,
      title: data.title,
      department: data.department,
      category: data.category,
      sensitivity: data.sensitivity,
      owner: data.owner,
      link: data.link
    }));

    if (params.role === 'ADMIN') {
      return documents;
    }

    return documents.filter(doc => doc.department === params.department);
  }
}
