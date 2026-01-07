import { describe, it, expect } from 'vitest';
import { ParsingService } from '../services/parsing.service.js';

describe('Mitigation Strategy: Chunk Overlap', () => {
    const parser = new ParsingService();

    it('should create overlapping chunks for context continuity', () => {
        const content = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.";
        // Force small chunks and small overlap
        // ChunkSize: 25, Overlap: 10
        const chunks = parser.chunkContent(content, 25, 10);
        
        console.log('Chunks:', chunks);
        
        expect(chunks.length).toBeGreaterThan(1);
        
        // Verify information continuity: the end of one chunk should exist in the start of the next
        for (let i = 0; i < chunks.length - 1; i++) {
            const currentChunk = chunks[i]!;
            const nextChunk = chunks[i+1]!;
            
            // Check if the last 8 characters of current chunk are present in the first 15 of the next chunk
            // (Using 8 and 15 to be robust against minor formatting shifts or spacing)
            const overlapMarker = currentChunk.slice(-8);
            expect(nextChunk.substring(0, 15)).toContain(overlapMarker);
        }
    });

    it('should not lose data in large, single-sentence paragraphs', () => {
        const longPara = "This_is_a_very_long_paragraph_without_punctuation_that_needs_to_be_split_up_properly.";
        // Force split by words (or chars if no spaces)
        const chunks = parser.chunkContent(longPara, 20, 5);
        
        console.log('Long Para Chunks:', chunks);
        expect(chunks.length).toBeGreaterThan(1);
        
        const c0 = chunks[0]!;
        const c1 = chunks[1]!;
        const overlap = c0.slice(-5);
        expect(c1).toContain(overlap);
    });
});
