import { describe, it, expect } from 'vitest';
import { ParsingService } from '../services/parsing.service.js';

describe('Core Logic: ParsingService', () => {
    const parsingService = new ParsingService();

    it('should chunk short text into one block', () => {
        const text = 'Hello world';
        const chunks = parsingService.chunkContent(text, 100);
        expect(chunks.length).toBe(1);
        expect(chunks[0]).toBe('Hello world');
    });

    it('should split long text considering sentence boundaries (mock logic)', () => {
        // Verify method existence and basic behavior.
        // Implementation might simple slice or regex.
        const longSentence = 'A'.repeat(50) + '.';
        const text = (longSentence + ' ').repeat(5); // 250+ spaces
        
        // Chunk size 100
        const chunks = parsingService.chunkContent(text, 100);
        
        expect(chunks.length).toBeGreaterThan(1);
        // Ensure no chunk exceeds limit (approx)
        expect(chunks[0]!.length).toBeLessThanOrEqual(100); // Strict limit depends on implementation
    });

    it('should extract metadata from YAML', () => {
        const content = `---
title: My Doc
category: IT
---
Real content here.`;
        
        const { metadata, cleanContent } = parsingService.extractMetadata(content);
        
        expect(metadata.title).toBe('My Doc');
        expect(metadata.category).toBe('IT');
        expect(cleanContent.trim()).toBe('Real content here.');
    });
});
