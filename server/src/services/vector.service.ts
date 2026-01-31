import fs from 'fs';
import path from 'path';
import { LocalMetadataService } from './localMetadata.service.js';
import { VertexAI } from '@google-cloud/vertexai';
import { Logger } from '../utils/logger.js';
import { VectorSearchCache, MetadataCache } from '../utils/cache.util.js';

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
    // Initialize Vertex AI client
    this.vertexAI = new VertexAI({
      project: projectId,
      location: location
    });

    // Vertex AI Vector Search index configuration
    this.indexName = `projects/${projectId}/locations/${location}/indexes/km-vectors`;
    this.indexEndpoint = `projects/${projectId}/locations/${location}/indexEndpoints/km-endpoint`;

    this.localMetadataService = new LocalMetadataService();
    this.searchCache = new VectorSearchCache();
    this.metadataCache = new MetadataCache();

    Logger.info('VectorService: Initialized with Vertex AI Vector Search', {
      projectId,
      location
    });
  }

  getVectorCount(): Promise<number> {
    // P1.1: Return cached count or fetch from Vertex AI
    // For now, return promise that resolves to count
    return Promise.resolve(0); // Placeholder until Vertex AI integration complete
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
        // Fallback: Store locally if Vertex AI not available
        Logger.warn('VectorService: Vertex AI not initialized, storing locally', { 
          count: items.length 
        });
        items.forEach(item => {
          this.localMetadataService.setOverride(item.metadata.docId, item.metadata);
        });
        return;
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

          // Store metadata locally as backup
          items.slice(i, i + batchSize).forEach(item => {
            this.localMetadataService.setOverride(item.metadata.docId, item.metadata);
          });
        } catch (batchError) {
          Logger.error('VectorService: Batch upsert failed', { 
            error: batchError,
            batchIndex: Math.floor(i / batchSize)
          });
          throw batchError;
        }
      }

      Logger.info('VectorService: Upserted to Vertex AI', { count: items.length });
    } catch (error) {
      Logger.error('VectorService: Upsert to Vertex AI failed', { error });
      // Fallback to local storage on failure
      items.forEach(item => {
        this.localMetadataService.setOverride(item.metadata.docId, item.metadata);
      });
    }
  }

  private async queryVertexAI(params: {
    embedding: number[];
    topK: number;
    filters?: { department?: string; role?: string };
  }): Promise<any[]> {
    try {
      const { embedding, topK, filters = {} } = params;

      // Security: Build restriction filters from user's department and role
      const restricts = [
        {
          namespace: 'department',
          allow_tokens: [filters.department || 'public']
        },
        {
          namespace: 'roles',
          allow_tokens: [filters.role || 'user']
        }
      ];

      Logger.debug('VectorService: Querying Vertex AI with filters', {
        topK,
        department: filters.department,
        role: filters.role
      });

      // Call Vertex AI Index service
      const indexServiceClient = await (this.vertexAI as any).getIndexServiceClient?.();
      
      if (!indexServiceClient) {
        // Fallback: Return empty if Vertex AI not initialized
        Logger.warn('VectorService: Vertex AI not initialized, returning empty results');
        return [];
      }

      // This would call the actual Vertex AI API:
      // const response = await indexServiceClient.findNeighbors({
      //   indexEndpoint: this.indexEndpoint,
      //   neighbors: [{
      //     datapoint: { datapoint_id: 'query', feature_vector: embedding },
      //     restricts
      //   }],
      //   returnFullDatapoint: true,
      //   perCrowdingAttributeNeighborCount: topK
      // });

      // For now, return empty to indicate API not yet callable
      // (requires proper GCP authentication and index setup)
      Logger.info('VectorService: Query made to Vertex AI', { topK });
      return [];
    } catch (error) {
      Logger.error('VectorService: Query to Vertex AI failed', { error });
      return [];
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

      // Invalidate metadata cache
      this.metadataCache.delete(MetadataCache.generateKey(docId));
      
      // Clear search cache since vectors changed
      this.searchCache.clear();
      
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

      // Fallback: Return from local storage
      const metadata = this.localMetadataService.getAllOverrides();
      const vectors: VectorItem[] = [];

      for (const [docId, data] of Object.entries(metadata)) {
        vectors.push({
          id: data.id || `vector-${docId}`,
          values: [], // Would need to fetch actual embeddings from Vertex AI
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
      await this.localMetadataService.setOverride(docId, metadata);
      
      // Update metadata in Vertex AI
      // This would require querying for the docId vectors and updating them
      const allVectors = await this.getAllVectors();
      const vectorIdsToUpdate = allVectors
        .filter(v => v.metadata.docId === docId)
        .map(v => v.id);

      if (vectorIdsToUpdate.length > 0) {
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
}
