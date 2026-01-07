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
   * Includes overlap to prevent "False Interpretations" caused by slicing context mid-sentence.
   */
  chunkContent(content: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
    const chunks: string[] = [];
    
    // Normalize newlines
    const text = content.replace(/\r\n/g, '\n');
    
    // Split by paragraphs first (double newline)
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';

    const pushChunk = () => {
        let trimmedResult = currentChunk.trim();
        if (trimmedResult.length > 0) {
            chunks.push(trimmedResult);
            
            // For overlap, keep the last N characters for the next chunk
            if (chunkOverlap > 0 && currentChunk.length > chunkOverlap) {
                currentChunk = currentChunk.substring(currentChunk.length - chunkOverlap);
            } else {
                currentChunk = '';
            }
        }
    };

    for (const paragraph of paragraphs) {
        // If paragraph is larger than chunk size, we need to break it down
        if (paragraph.length > chunkSize) {
            const sentences = paragraph.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [paragraph];
            
            for (let sentence of sentences) {
                // If even a single sentence is too large, split by words
                if (sentence.length > chunkSize) {
                   const words = sentence.split(/\s+/);
                   for (const word of words) {
                       if (word.length > chunkSize) {
                           // FALLBACK: If a single word is too large, slice it by chars
                           let remaining = word;
                           while (remaining.length > 0) {
                               if (currentChunk.length >= chunkSize) pushChunk();
                               const take = chunkSize - currentChunk.length;
                               currentChunk += remaining.substring(0, take);
                               remaining = remaining.substring(take);
                               if (remaining.length > 0) pushChunk();
                           }
                       } else {
                           if (currentChunk.length + word.length + 1 > chunkSize) {
                               pushChunk();
                           }
                           currentChunk += (currentChunk ? ' ' : '') + word;
                       }
                   }
                } else {
                    if (currentChunk.length + sentence.length + 1 > chunkSize) {
                        pushChunk();
                    }
                    currentChunk += (currentChunk ? (currentChunk.endsWith(' ') ? '' : ' ') : '') + sentence;
                }
            }
        } else {
            if (currentChunk.length + paragraph.length + 2 > chunkSize) {
                pushChunk();
            }
            currentChunk += (currentChunk ? (currentChunk.endsWith('\n\n') ? '' : '\n\n') : '') + paragraph;
        }
    }

    // Final push: only if it's longer than just the overlap we carried over
    if (currentChunk.trim().length > chunkOverlap) {
        chunks.push(currentChunk.trim());
    } else if (chunks.length === 0 && currentChunk.trim().length > 0) {
        // Handle case where total content is smaller than overlap
        chunks.push(currentChunk.trim());
    }
    return chunks;
  }
}
