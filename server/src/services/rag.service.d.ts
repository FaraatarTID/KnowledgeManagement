import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';
export declare class RAGService {
    private geminiService;
    private vectorService;
    constructor(geminiService: GeminiService, vectorService: VectorService);
    query(params: {
        query: string;
        userId: string;
        userProfile: {
            name: string;
            department: string;
            role: string;
        };
    }): Promise<{
        answer: string;
        sources: {
            id: string;
            docId: string;
            score: number;
        }[];
        usage: import("@google-cloud/vertexai").UsageMetadata | undefined;
    }>;
}
//# sourceMappingURL=rag.service.d.ts.map