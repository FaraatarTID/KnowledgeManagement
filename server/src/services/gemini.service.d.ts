export declare class GeminiService {
    private vertexAI;
    private model;
    private embeddingModel;
    private isMock;
    constructor(projectId: string, location?: string);
    generateEmbedding(text: string): Promise<number[]>;
    queryKnowledgeBase(params: {
        query: string;
        context: string[];
        userProfile: {
            name: string;
            department: string;
            role: string;
        };
    }): Promise<{
        text: string;
        usageMetadata: import("@google-cloud/vertexai").UsageMetadata | undefined;
    }>;
}
//# sourceMappingURL=gemini.service.d.ts.map