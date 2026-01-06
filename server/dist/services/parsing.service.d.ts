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
export declare class ParsingService {
    /**
     * Extracts metadata from the YAML block at the top of the document.
     */
    extractMetadata(content: string): {
        metadata: Partial<DocumentMetadata>;
        cleanContent: string;
    };
    /**
     * Chunks content into smaller pieces for RAG.
     */
    chunkContent(content: string, chunkSize?: number): string[];
}
//# sourceMappingURL=parsing.service.d.ts.map