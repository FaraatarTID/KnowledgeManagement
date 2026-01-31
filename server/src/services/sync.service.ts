import { DriveService } from './drive.service.js';
import { VectorService } from './vector.service.js';
import { GeminiService } from './gemini.service.js';
import { ParsingService } from './parsing.service.js';
import { HistoryService } from './history.service.js';
import { LocalMetadataService } from './localMetadata.service.js';
import { ExtractionService } from './extraction.service.js';
import { JSONStore } from '../utils/jsonStore.js';
import fs from 'fs';
import path from 'path';

export class SyncService {
  private parsingService: ParsingService;
  private historyService: HistoryService;
  private localMetadataService: LocalMetadataService;
  private extractionService: ExtractionService;
  private statusStore: JSONStore<Record<string, any>>;
  private isSyncing = false;

  constructor(
    private driveService: DriveService,
    private vectorService: VectorService,
    private geminiService: GeminiService,
    statusStoragePath?: string
  ) {
    this.parsingService = new ParsingService();
    this.historyService = new HistoryService();
    this.localMetadataService = new LocalMetadataService();
    this.extractionService = new ExtractionService();
    
    const defaultPath = path.join(process.cwd(), 'data', 'sync_status.json');
    this.statusStore = new JSONStore(statusStoragePath || defaultPath, {});
  }

  async syncAll(folderId: string) {
    if (this.isSyncing) {
       console.warn('SyncService: Sync already in progress. Ignoring request.');
       return { status: 'already_syncing' };
    }

    this.isSyncing = true;
    console.log('SyncService: Starting full sync...');
    
    // 1. List all files
    const files = await this.driveService.listFiles(folderId);
    console.log(`SyncService: Found ${files.length} files.`);

    let processedRequestCount = 0;
    const itemsToUpsert: any[] = [];

    // 2. Process each file
    for (const file of files) {
      if (!file.id || !file.name) continue;
      
      // Skip folders
      if (file.mimeType?.includes('folder')) continue;

      try {
        await this.indexFile(file as any);
        processedRequestCount++;
      } catch (e) {
        console.error(`SyncService: Failed to process ${file.name}`, e);
      }
    }

    // 3. Prune deleted documents
    console.log('SyncService: Pruning deleted documents...');
    const driveIds = new Set(files.filter(f => f.id).map(f => f.id!));
    await this.pruneDeletedDocuments(driveIds);

    this.isSyncing = false;
    console.log('SyncService: Sync complete.');
    return { status: 'success', processed: processedRequestCount };
  }

  /**
   * Removes vectors from local store that are no longer present in Google Drive
   */
  private async pruneDeletedDocuments(currentDriveIds: Set<string>) {
    const meta = await this.vectorService.getAllMetadata();
    const localIds = Object.keys(meta);
    
    let pruneCount = 0;
    for (const docId of localIds) {
      // Only prune documents that look like they came from Drive (manual- prefix is for uploads)
      if (!docId.startsWith('manual-') && !currentDriveIds.has(docId)) {
         console.log(`SyncService: Pruning deleted document ${docId}`);
         await this.vectorService.deleteDocument(docId);
         pruneCount++;
      }
    }
    
    if (pruneCount > 0) {
       await this.historyService.recordEvent({
         event_type: 'PRUNED',
         details: `Removed ${pruneCount} dangling documents no longer in Google Drive.`
       });
    }
  }
  /**
   * Main entry point for indexing a file.
   * Everything is wrapped in a transaction with rollback capability.
   */
  async indexFile(file: { id: string, name: string, mimeType?: string, webViewLink?: string, modifiedTime?: string, owners?: any[] }, initialMetadata?: { department: string, sensitivity: string, category: string, owner?: string }): Promise<string> {
    if (this.isSyncing) {
       console.warn(`SyncService: Cannot index ${file.name} while a full sync is in progress.`);
       throw new Error('System is currently performing a full synchronization. Please try again in a few minutes.');
    }

    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Transaction ${transactionId}] Starting index for ${file.name}`);
    
    // SECURITY: Detect if this is an update or a new document
    const allMeta = await this.vectorService.getAllMetadata();
    const existed = !!allMeta[file.id];

    // Track what needs to be rolled back
    const rollbackActions: (() => Promise<void>)[] = [];

    try {
      if (!file.id || !file.name) {
        throw new Error('Invalid file: missing id or name');
      }

      // 1. Extract text content
      let textContent = '';
      if (file.mimeType === 'application/vnd.google-apps.document') {
         try {
           textContent = await this.driveService.exportDocument(file.id);
         } catch (e: any) {
           await this.logExtractionFailure(file, e, 'export');
           textContent = `Filename: ${file.name}\nType: ${file.mimeType}\n\n(Content export failed: ${e.message})`;
         }
      } else if (file.mimeType === 'application/pdf' || 
                 file.mimeType?.includes('wordprocessing') || 
                 file.mimeType?.startsWith('text/') ||
                 file.mimeType?.includes('markdown')) {
         try {
           const buffer = await this.driveService.downloadFile(file.id);
           textContent = await this.extractionService.extractFromBuffer(buffer, file.mimeType || 'application/octet-stream');
         } catch (e: any) {
           await this.logExtractionFailure(file, e, 'download/extract');
           textContent = `Filename: ${file.name}\nType: ${file.mimeType}\n\n(Content extraction failed: ${e.message})`;
         }
      } else {
         textContent = `Filename: ${file.name}\nType: ${file.mimeType}`; 
      }

      if (!textContent) {
        console.warn(`[Transaction ${transactionId}] No content extracted for ${file.name}`);
        return file.id;
      }

      // 2. Metadata Extraction & Normalization
      const { metadata, cleanContent } = this.parsingService.extractMetadata(textContent);
      const override = this.localMetadataService.getOverride(file.id);
      
      const finalMetadata = {
        title: override?.title || metadata.title || file.name,
        department: override?.department || metadata.department || this.detectDepartment(file.name),
        sensitivity: override?.sensitivity || metadata.sensitivity || 'INTERNAL',
        category: override?.category || metadata.category || 'General',
        owner: metadata.owner || file.owners?.[0]?.emailAddress
      };

      // 3. Chunking & Embedding
      const chunks = this.parsingService.chunkContent(cleanContent, 1000);
      const BATCH_SIZE = 5;
      const CONCURRENCY = 3; 
      const itemsToUpsert: any[] = [];

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchEmbeddings: number[][] = [];
        
        for (let j = 0; j < batch.length; j += CONCURRENCY) {
          const concurrentChunk = batch.slice(j, j + CONCURRENCY);
          const concurrentEmbeddings = await Promise.all(
            concurrentChunk.map(chunk => this.geminiService.generateEmbedding(chunk))
          );
          batchEmbeddings.push(...concurrentEmbeddings);
        }

        batchEmbeddings.forEach((embedding, index) => {
          const chunkIndex = i + index;
          const chunk = batch[index];
          if (!chunk) return;

          itemsToUpsert.push({
            id: `${file.id}_${chunkIndex}`,
            values: embedding,
            metadata: {
              docId: file.id,
              text: chunk,
              link: file.webViewLink || '#',
              mimeType: file.mimeType,
              modifiedAt: file.modifiedTime || new Date().toISOString(),
              ...finalMetadata
            }
          });
        });
      }

      // 4. Persistence with Rollback Guard
      rollbackActions.unshift(async () => {
        console.log(`[Rollback ${transactionId}] Removing vectors for ${file.id}`);
        await this.vectorService.deleteDocument(file.id);
      });

      if (itemsToUpsert.length > 0) {
        await this.vectorService.upsertVectors(itemsToUpsert);
        
        await this.historyService.recordEvent({
          event_type: 'UPDATED', 
          doc_id: file.id,
          doc_name: file.name,
          details: `Indexed ${chunks.length} chunks. TX: ${transactionId}`
        });

        await this.updateSyncStatus(file.id, {
          status: 'SUCCESS',
          message: `Indexed ${chunks.length} chunks`,
          transactionId,
          lastSync: new Date().toISOString(),
          fileName: file.name
        });
      }

      console.log(`[Transaction ${transactionId}] Completed successfully.`);
      return file.id;

    } catch (e: any) {
      console.error(`[Transaction ${transactionId}] Process failed:`, e.message);
      
      // SECURITY: Rollback only if it was a new document attempt 
      if (!existed && rollbackActions.length > 0) {
        for (const action of rollbackActions) {
          try { await action(); } catch (err) { console.error('Rollback action failed', err); }
        }
      }

      await this.updateSyncStatus(file.id, {
        status: 'FAILED',
        message: e.message,
        transactionId,
        lastSync: new Date().toISOString(),
        fileName: file.name
      });
      throw e;
    }
  }

  /**
   * Rollback any partial changes for a document
   */
  private async rollbackIndexTransaction(docId: string, transactionId: string): Promise<void> {
    console.log(`[Rollback ${transactionId}] Rolling back index for ${docId}`);
    try {
      await this.vectorService.deleteDocument(docId);
      await this.updateSyncStatus(docId, {
        status: 'ROLLED_BACK',
        message: 'Transaction rolled back due to error',
        transactionId,
        lastSync: new Date().toISOString()
      });
    } catch (e) {
      console.error(`[Rollback ${transactionId}] Failed to rollback:`, e);
    }
  }

  private async updateSyncStatus(docId: string, status: any) {
    try {
      await this.statusStore.update(current => {
         current[docId] = { ...status, updatedAt: new Date().toISOString() };
         return current;
      });
    } catch (e: any) {
      console.error('SYNC_STATUS_UPDATE_FAILED', e.message);
    }
  }

  private detectDepartment(filename: string): string {
    const fn = filename.toLowerCase();
    if (fn.includes('hr') || fn.includes('people')) return 'HR';
    if (fn.includes('finance') || fn.includes('budget')) return 'Finance';
    if (fn.includes('it') || fn.includes('security') || fn.includes('tech')) return 'IT';
    if (fn.includes('sales') || fn.includes('marketing')) return 'Sales';
    if (fn.includes('legal')) return 'Legal';
    return 'General';
  }

  private async logExtractionFailure(file: { id: string, name: string, mimeType?: string }, error: any, operation: string) {
    console.warn(`SyncService: Extraction failure on ${file.name} during ${operation}: ${error.message}`);
    await this.historyService.recordEvent({
      event_type: 'EXTRACTION_FAILED',
      doc_id: file.id,
      doc_name: file.name,
      details: `Operation ${operation} failed: ${error.message}`
    });
  }
}
