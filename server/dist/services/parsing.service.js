import yaml from 'yaml';
export class ParsingService {
    /**
     * Extracts metadata from the YAML block at the top of the document.
     */
    extractMetadata(content) {
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
        }
        catch (error) {
            console.error('Error parsing metadata:', error);
            return { metadata: {}, cleanContent: content };
        }
    }
    /**
     * Chunks content into smaller pieces for RAG.
     */
    chunkContent(content, chunkSize = 1000) {
        // Simple chunking by paragraph or fixed size for now
        const paragraphs = content.split('\n\n');
        const chunks = [];
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
//# sourceMappingURL=parsing.service.js.map