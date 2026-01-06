export declare class VectorService {
    private projectId;
    private location;
    private isMock;
    constructor(projectId: string, location: string);
    similaritySearch(params: {
        embedding: number[];
        topK: number;
        filters?: any;
    }): Promise<{
        id: string;
        score: number;
        metadata: {
            docId: string;
            text: string;
        };
    }[]>;
    upsertVectors(vectors: {
        id: string;
        values: number[];
        metadata: any;
    }[]): Promise<void>;
}
//# sourceMappingURL=vector.service.d.ts.map