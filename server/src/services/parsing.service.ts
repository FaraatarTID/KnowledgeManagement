import yaml from 'yaml';

export interface DocumentMetadata {
  document_id?: string;
  title: string;
  category: string;
  subcategory?: string;
  tags?: string[];
  owner: string;
  department: string;
  version?: string;
  status?: string;
  sensitivity: string;
  ai_access?: {
    allowed: boolean;
    agent_types?: string[];
    purposes?: string[];
    redact_fields?: string[];
  };
}

export class ParsingService {
  /**
   * Extracts metadata from the YAML block at the top of the document.
   */
  extractMetadata(content: string): { metadata: Partial<DocumentMetadata>, cleanContent: string } {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) {
      return { metadata: {}, cleanContent: content };
    }

    try {
      const metadataStr = match[1] || '';
      const parsed = yaml.parse(metadataStr);
      const metadata = parsed.METADATA || parsed;
      const cleanContent = content.replace(match[0], '').trim();
      return { metadata, cleanContent };
    } catch (error) {
      console.error('Error parsing metadata:', error);
      return { metadata: {}, cleanContent: content };
    }
  }

  /**
   * Chunks content into smaller pieces for RAG.
   */
  chunkContent(content: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    
    // Normalize newlines
    const text = content.replace(/\r\n/g, '\n');
    
    // Split by paragraphs first (double newline)
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';

    const pushChunk = () => {
        if (currentChunk.trim().length > 0) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }
    };

    for (const paragraph of paragraphs) {
        // If paragraph is small enough to fit in current chunk
        if (currentChunk.length + paragraph.length + 2 <= chunkSize) {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            continue;
        }

        // If paragraph causes overflow, push current chunk
        pushChunk();

        // If paragraph itself is larger than chunk size, split by sentences
        if (paragraph.length > chunkSize) {
            // STRATEGIC FIX: Robust sentence splitting with character class boundaries
            // This prevents ReDoS and handles diverse punctuation.
            const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph];
            
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > chunkSize) {
                    pushChunk();
                }
                currentChunk += sentence;
            }
        } else {
             // Paragraph fits in a fresh chunk
             currentChunk = paragraph;
        }
    }

    pushChunk();
    return chunks;
  }
}
