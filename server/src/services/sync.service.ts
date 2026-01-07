import { DriveService } from './drive.service.js';
import { VectorService } from './vector.service.js';
import { GeminiService } from './gemini.service.js';
import { ParsingService } from './parsing.service.js';
import { HistoryService } from './history.service.js';
import { LocalMetadataService } from './localMetadata.service.js';
import { ExtractionService } from './extraction.service.js';

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

  async indexFile(file: { id: string, name: string, mimeType?: string, webViewLink?: string, modifiedTime?: string, owners?: any[] }) {
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

    if (!textContent) return;

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

    const itemsToUpsert: any[] = [];

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
    }

    // 7. Record History Event
    await this.historyService.recordEvent({
      event_type: 'UPDATED', 
      doc_id: file.id!,
      doc_name: file.name!,
      details: `Indexed ${chunks.length} chunks.`
    });

    if (itemsToUpsert.length > 0) {
       await this.vectorService.upsertVectors(itemsToUpsert);
    }
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
