import { DriveService } from './drive.service.js';
import { VectorService } from './vector.service.js';
import { GeminiService } from './gemini.service.js';

export class SyncService {
  constructor(
    private driveService: DriveService,
    private vectorService: VectorService,
    private geminiService: GeminiService
  ) {}

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
        // Note: For real PDFs we need a parser. For now, assume GDoc/Text or fallback to name/description
        // Since we don't have pdf-parse here, we will index the metadata + name for non-gdocs
        // OR try to export if it's a google doc.
        
        let textContent = '';
        if (file.mimeType === 'application/vnd.google-apps.document') {
           textContent = await this.driveService.exportDocument(file.id);
        } else {
           // For binary files (PDF/Word), we ideally download and parse. 
           // For this "Lite" version, we'll index the Title + Snippet/Name.
           // Warning: PDF content won't be indexed without a library like pdf-parse.
           textContent = `Filename: ${file.name}\nType: ${file.mimeType}`; 
        }

        if (!textContent) continue;

        // 4. Chunking (Simple)
        const chunks = this.chunkText(textContent, 1000); // 1000 char chunks

        // 5. Embed & Prepare Upsert
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk) continue;
          const embedding = await this.geminiService.generateEmbedding(chunk);
          
          itemsToUpsert.push({
            id: `${file.id}_${i}`,
            values: embedding,
            metadata: {
              docId: file.id,
              title: file.name,
              text: chunk,
              link: file.webViewLink,
              mimeType: file.mimeType,
              department: this.detectDepartment(file.name)
            }
          });
        }
        
        processedRequestCount++;
        
        // Batch upsert every 10 docs to save progress
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
    const chunks = [];
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.substring(i, i + size));
    }
    return chunks;
  }
}
