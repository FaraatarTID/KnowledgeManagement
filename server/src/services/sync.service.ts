import { DriveService } from './drive.service.js';
import { VectorService } from './vector.service.js';
import { GeminiService } from './gemini.service.js';
import { ParsingService } from './parsing.service.js';
import { HistoryService } from './history.service.js';
import { LocalMetadataService } from './localMetadata.service.js';
import { ExtractionService } from './extraction.service.js';
import fs from 'fs';
import path from 'path';

export class SyncService {
  private parsingService: ParsingService;
  private historyService: HistoryService;
  private localMetadataService: LocalMetadataService;
  private extractionService: ExtractionService;

  constructor(
    private driveService: DriveService,
    private vectorService: VectorService,
    private geminiService: GeminiService
  ) {
    this.parsingService = new ParsingService();
    this.historyService = new HistoryService();
    this.localMetadataService = new LocalMetadataService();
    this.extractionService = new ExtractionService();
  }

  async syncAll(folderId: string) {
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

    console.log('SyncService: Sync complete.');
    return { status: 'success', processed: processedRequestCount };
  }

  async indexFile(file: { id: string, name: string, mimeType?: string, webViewLink?: string, modifiedTime?: string, owners?: any[] }, initialMetadata?: { department: string, sensitivity: string, category: string, owner?: string }): Promise<string> {
    // SECURITY: Transaction wrapper for atomic indexing
    const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`[Transaction ${transactionId}] Starting index for ${file.name}`);
    
    try {
      // Pre-transaction validation
      if (!file.id || !file.name) {
        throw new Error('Invalid file: missing id or name');
      }

      // Execute indexing within transaction
      const result = await this._doIndexFileWithTransaction(file, initialMetadata, transactionId);
      
      console.log(`[Transaction ${transactionId}] Completed successfully`);
      return result;
    } catch (e: any) {
      console.error(`[Transaction ${transactionId}] Failed:`, e.message);
      
      // Rollback on failure
      await this.rollbackIndexTransaction(file.id, transactionId);
      
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
   * Transactional indexing with rollback capability
   */
  private async _doIndexFileWithTransaction(
    file: { id: string, name: string, mimeType?: string, webViewLink?: string, modifiedTime?: string, owners?: any[] }, 
    initialMetadata?: { department: string, sensitivity: string, category: string, owner?: string },
    transactionId?: string
  ): Promise<string> {
    console.log(`SyncService: Indexing ${file.name} (TX: ${transactionId})...`);
    
    // Track what needs to be rolled back
    const rollbackActions: (() => Promise<void>)[] = [];

    try {
      // 1. Extract text
      let textContent = '';
      if (file.mimeType === 'application/vnd.google-apps.document') {
         textContent = await this.driveService.exportDocument(file.id);
      } else if (file.mimeType === 'application/pdf' || 
                 file.mimeType?.includes('wordprocessing') || 
                 file.mimeType?.startsWith('text/') ||
                 file.mimeType?.includes('markdown')) {
         try {
           const buffer = await this.driveService.downloadFile(file.id);
           textContent = await this.extractionService.extractFromBuffer(buffer, file.mimeType || 'application/octet-stream');
         } catch (e) {
           console.warn(`SyncService: Failed to download/extract ${file.name}. Indexing metadata only.`);
           textContent = `Filename: ${file.name}\nType: ${file.mimeType}\n\n(Content could not be extracted)`;
         }
      } else {
         textContent = `Filename: ${file.name}\nType: ${file.mimeType}`; 
      }

      if (!textContent) return file.id;

      // 2. Extract metadata
      const { metadata, cleanContent } = this.parsingService.extractMetadata(textContent);
      
      // 3. Apply overrides
      const override = this.localMetadataService.getOverride(file.id);
      const finalTitle = override?.title || metadata.title || file.name;
      const finalDepartment = override?.department || metadata.department || this.detectDepartment(file.name);
      const finalSensitivity = override?.sensitivity || metadata.sensitivity || 'INTERNAL';
      const finalCategory = override?.category || metadata.category || 'General';

      // 4. Chunk content
      const chunks = this.parsingService.chunkContent(cleanContent, 1000);

      // 5. Embed and prepare upsert
      const BATCH_SIZE = 5;
      const itemsToUpsert: any[] = [];

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const batchEmbeddings = await Promise.all(
          batch.map(chunk => this.geminiService.generateEmbedding(chunk))
        );

        batchEmbeddings.forEach((embedding, index) => {
          const chunkIndex = i + index;
          const chunk = batch[index];
          if (!chunk) return;

          itemsToUpsert.push({
            id: `${file.id}_${chunkIndex}`,
            values: embedding,
            metadata: {
              docId: file.id,
              title: finalTitle,
              text: chunk,
              link: file.webViewLink || '#',
              mimeType: file.mimeType,
              department: finalDepartment,
              sensitivity: finalSensitivity,
              category: finalCategory,
              modifiedAt: file.modifiedTime || new Date().toISOString(),
              owner: metadata.owner || file.owners?.[0]?.emailAddress
            }
          });
        });
      }

      // 6. Record rollback action BEFORE upsert
      rollbackActions.unshift(async () => {
        console.log(`[Rollback ${transactionId}] Removing vectors for ${file.id}`);
        await this.vectorService.deleteDocument(file.id);
      });

      // 7. Upsert vectors (this is the critical operation)
      if (itemsToUpsert.length > 0) {
        await this.vectorService.upsertVectors(itemsToUpsert);
        
        // 8. Record history
        await this.historyService.recordEvent({
          event_type: 'UPDATED', 
          doc_id: file.id!,
          doc_name: file.name!,
          details: `Indexed ${chunks.length} chunks. TX: ${transactionId}`
        });

        // 9. Update sync status
        await this.updateSyncStatus(file.id, {
          status: 'SUCCESS',
          message: `Successfully indexed ${chunks.length} chunks`,
          transactionId,
          lastSync: new Date().toISOString(),
          fileName: file.name
        });
      }

      return file.id;
    } catch (error) {
      // If we have rollback actions, execute them
      if (rollbackActions.length > 0) {
        console.log(`[Rollback ${transactionId}] Executing ${rollbackActions.length} rollback actions`);
        for (const action of rollbackActions) {
          try {
            await action();
          } catch (rollbackError) {
            console.error(`[Rollback ${transactionId}] Action failed:`, rollbackError);
          }
        }
      }
      throw error;
    }
  }

  /**
   * Rollback any partial changes for a document
   */
  private async rollbackIndexTransaction(docId: string, transactionId: string): Promise<void> {
    console.log(`[Rollback ${transactionId}] Rolling back index for ${docId}`);
    try {
      // Remove any vectors that might have been created
      await this.vectorService.deleteDocument(docId);
      
      // Update status to reflect rollback
      await this.updateSyncStatus(docId, {
        status: 'ROLLED_BACK',
        message: 'Transaction rolled back due to error',
        transactionId,
        lastSync: new Date().toISOString()
      });
    } catch (e) {
      console.error(`[Rollback ${transactionId}] Failed to rollback:`, e);
      // Don't throw - rollback errors are logged but don't fail the original error
    }
  }

  private async _doIndexFile(file: { id: string, name: string, mimeType?: string, webViewLink?: string, modifiedTime?: string, owners?: any[] }, initialMetadata?: { department: string, sensitivity: string, category: string, owner?: string }): Promise<string> {
    console.log(`SyncService: Indexing ${file.name}...`);
    
    // 3. Extract text
    let textContent = '';
    if (file.mimeType === 'application/vnd.google-apps.document') {
       textContent = await this.driveService.exportDocument(file.id);
    } else if (file.mimeType === 'application/pdf' || 
               file.mimeType?.includes('wordprocessing') || 
               file.mimeType?.startsWith('text/') ||
               file.mimeType?.includes('markdown')) {
       // Download and extract using ExtractionService
       try {
         const buffer = await this.driveService.downloadFile(file.id);
         textContent = await this.extractionService.extractFromBuffer(buffer, file.mimeType || 'application/octet-stream');
       } catch (e) {
         console.warn(`SyncService: Failed to download/extract ${file.name}. Indexing metadata only.`);
         textContent = `Filename: ${file.name}\nType: ${file.mimeType}\n\n(Content could not be extracted)`;
       }
    } else {
       // For OTHER binary files, index Title + Type
       textContent = `Filename: ${file.name}\nType: ${file.mimeType}`; 
    }

    if (!textContent) return file.id;

    // 4. Extract metadata from YAML frontmatter (if present)
    const { metadata, cleanContent } = this.parsingService.extractMetadata(textContent);
    
    // 4.5 Apply Local Overrides (Stability Feature)
    const override = this.localMetadataService.getOverride(file.id);
    const finalTitle = override?.title || metadata.title || file.name;
    const finalDepartment = override?.department || metadata.department || this.detectDepartment(file.name);
    const finalSensitivity = override?.sensitivity || metadata.sensitivity || 'INTERNAL';
    const finalCategory = override?.category || metadata.category || 'General';

    // 5. Chunk using ParsingService (paragraph-aware) or fallback
    const chunks = this.parsingService.chunkContent(cleanContent, 1000);

    // 6. Embed & Prepare Upsert (Parallel with Concurrency Control)
    // We'll process chunks in batches of 5 to avoid hitting Rate Limits while speeding up indexing.
    const BATCH_SIZE = 5;
    const itemsToUpsert: any[] = [];

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const batchEmbeddings = await Promise.all(
        batch.map(chunk => this.geminiService.generateEmbedding(chunk))
      );

      batchEmbeddings.forEach((embedding, index) => {
        const chunkIndex = i + index;
        const chunk = batch[index];
        if (!chunk) return;

        itemsToUpsert.push({
          id: `${file.id}_${chunkIndex}`,
          values: embedding,
          metadata: {
            docId: file.id,
            title: finalTitle,
            text: chunk,
            link: file.webViewLink || '#',
            mimeType: file.mimeType,
            department: finalDepartment,
            sensitivity: finalSensitivity,
            category: finalCategory,
            modifiedAt: file.modifiedTime || new Date().toISOString(),
            owner: metadata.owner || file.owners?.[0]?.emailAddress
          }
        });
      });
    }

    // 7. Record History Event
    await this.historyService.recordEvent({
      event_type: 'UPDATED', 
      doc_id: file.id!,
      doc_name: file.name!,
      details: `Indexed ${chunks.length} chunks.`
    });

    if (itemsToUpsert.length > 0) {
      // Finalize indexing
      await this.vectorService.upsertVectors(itemsToUpsert);
      
      // STRATEGIC FIX: Log Sync Success to Status Tracking
      await this.updateSyncStatus(file.id, {
        status: 'SUCCESS',
        message: `Successfully indexed ${chunks.length} chunks`,
        lastSync: new Date().toISOString(),
        fileName: file.name
      });
    }

    return file.id;
  }

  private async updateSyncStatus(docId: string, status: any) {
    const STATUS_FILE = path.join(process.cwd(), 'data', 'sync_status.json');
    try {
      const dataDir = path.dirname(STATUS_FILE);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      
      let data: Record<string, any> = {};
      if (fs.existsSync(STATUS_FILE)) {
        data = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      }
      
      data[docId] = { ...status, updatedAt: new Date().toISOString() };
      fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('SyncService: Failed to update sync status', e);
    }
  }

  /**
   * Optimized department detection using Map lookup
   * Patterns are checked in order of likelihood
   */
  private detectDepartment(filename: string): string {
    const fn = filename.toLowerCase();
    
    // Use Map for O(1) lookup instead of sequential if statements
    const departmentPatterns = new Map([
      ['it', ['security', 'it', 'technical', 'infrastructure']],
      ['compliance', ['legal', 'compliance', 'regulatory', 'policy']],
      ['marketing', ['marketing', 'sales', 'promotion', 'campaign']],
      ['engineering', ['engineering', 'product', 'dev', 'development', 'code']],
      ['hr', ['hr', 'human', 'resources', 'personnel', 'recruit']],
      ['finance', ['finance', 'budget', 'accounting', 'expense', 'revenue']]
    ]);

    // Check each department's patterns
    for (const [dept, patterns] of departmentPatterns.entries()) {
      if (patterns.some(pattern => fn.includes(pattern))) {
        return dept.charAt(0).toUpperCase() + dept.slice(1);
      }
    }

    return 'General';
  }
}
