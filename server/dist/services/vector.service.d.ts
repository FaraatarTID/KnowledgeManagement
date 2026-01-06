export declare class VectorService {
    private projectId;
    private location;
    private isMock;
    private vectors;
    private readonly DATA_FILE;
    constructor(projectId: string, location: string);
    private loadVectors;
    private saveVectors;
    similaritySearch(params: {
        embedding: number[];
        topK: number;
        filters?: {
            department?: string;
            role?: string;
            [key: string]: any;
        };
    }): Promise<{
        score: number;
        id: string;
        values: number[];
        metadata: {
            docId: string;
            title: string;
            text: string;
            link?: string;
            [key: string]: any;
        };
    }[] | {
        id: string;
        score: number;
        metadata: {
            docId: string;
            title: string;
            text: string;
        };
    }[]>;
    deleteDocument(docId: string): Promise<void>;
    upsertVectors(vectors: {
        id: string;
        values: number[];
        metadata: any;
    }[]): Promise<void>;
    private cosineSimilarity;
}
//# sourceMappingURL=vector.service.d.ts.map