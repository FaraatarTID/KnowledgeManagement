import { DriveService } from './drive.service.js';
import { VectorService } from './vector.service.js';
import { GeminiService } from './gemini.service.js';
import { ParsingService } from './parsing.service.js';
import { HistoryService } from './history.service.js';

export class SyncService {
  private parsingService: ParsingService;
  private historyService: HistoryService;

  constructor(
    private driveService: DriveService,
    private vectorService: VectorService,
    private geminiService: GeminiService
  ) {
    this.parsingService = new ParsingService();
    this.historyService = new HistoryService();
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
        console.log(`SyncService: Processing ${file.name}...`);
        
        // 3. Extract text
        let textContent = '';
        if (file.mimeType === 'application/vnd.google-apps.document') {
           textContent = await this.driveService.exportDocument(file.id);
        } else {
           // For binary files (PDF/Word), index Title + Type
           // Note: Full PDF parsing requires pdf-parse library
           textContent = `Filename: ${file.name}\nType: ${file.mimeType}`; 
        }

        if (!textContent) continue;

        // 4. Extract metadata from YAML frontmatter (if present)
        const { metadata, cleanContent } = this.parsingService.extractMetadata(textContent);
        
        // Use metadata department if available, otherwise detect from filename
        const department = metadata.department || this.detectDepartment(file.name);
        const sensitivity = metadata.sensitivity || 'INTERNAL';
        const category = metadata.category || 'General';

        // 5. Chunk using ParsingService (paragraph-aware) or fallback
        const chunks = metadata.title 
          ? this.parsingService.chunkContent(cleanContent, 1000)
          : this.chunkText(cleanContent, 1000);

        // 6. Embed & Prepare Upsert
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk) continue;
          const embedding = await this.geminiService.generateEmbedding(chunk);
          
          itemsToUpsert.push({
            id: `${file.id}_${i}`,
            values: embedding,
            metadata: {
              docId: file.id,
              title: metadata.title || file.name,
              text: chunk,
              link: file.webViewLink,
              mimeType: file.mimeType,
              department,
              sensitivity,
              category,
              modifiedAt: file.modifiedTime,
              owner: metadata.owner || file.owners?.[0]?.emailAddress
            }
          });
        }

        // 7. Record History Event
        // Check if this doc was already in vector store to decide CREATED vs UPDATED
        // (Simple heuristic: if processing succeeds, it's an update or new sync)
        await this.historyService.recordEvent({
          event_type: 'UPDATED', // Defaulting to updated for simplicity in this pass
          doc_id: file.id!,
          doc_name: file.name!,
          details: `Synced ${chunks.length} chunks. Last modified in Drive: ${file.modifiedTime}`
        });
        
        processedRequestCount++;
        
        // Batch upsert every 20 chunks to save progress
        if (itemsToUpsert.length >= 20) {
           await this.vectorService.upsertVectors(itemsToUpsert);
           itemsToUpsert.length = 0; // Clear
        }

      } catch (e) {
        console.error(`SyncService: Failed to process ${file.name}`, e);
      }
    }

    // Final batch
    if (itemsToUpsert.length > 0) {
       await this.vectorService.upsertVectors(itemsToUpsert);
    }

    console.log('SyncService: Sync complete.');
    return { status: 'success', processed: processedRequestCount };
  }

  private detectDepartment(filename: string): string {
    const fn = filename.toLowerCase();
    if (fn.includes('security') || fn.includes('it')) return 'IT';
    if (fn.includes('legal') || fn.includes('compliance')) return 'Compliance';
    if (fn.includes('marketing') || fn.includes('sales')) return 'Marketing';
    if (fn.includes('engineering') || fn.includes('product')) return 'Engineering';
    return 'General';
  }

  private chunkText(text: string, size: number): string[] {
    // Use sentence-aware chunking to preserve semantic context
    // Split by common sentence-ending punctuation
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      // If adding this sentence would exceed size, save current chunk and start new one
      if ((currentChunk + sentence).length > size && currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
