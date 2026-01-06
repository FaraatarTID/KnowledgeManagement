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
    // Simple chunking by paragraph or fixed size for now
    const paragraphs = content.split('\n\n');
    const chunks: string[] = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
      if ((currentChunk + paragraph).length > chunkSize && currentChunk !== '') {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += paragraph + '\n\n';
    }

    if (currentChunk.trim() !== '') {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }
}
