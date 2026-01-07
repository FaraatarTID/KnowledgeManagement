import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';
import { RedactionService } from './redaction.service.js';
import { AuditService } from './access.service.js';
export class RAGService {
    geminiService;
    vectorService;
    redactionService;
    auditService;
    constructor(geminiService, vectorService) {
        this.geminiService = geminiService;
        this.vectorService = vectorService;
        this.redactionService = new RedactionService();
        this.auditService = new AuditService();
    }
    async query(params) {
        const { query, userId, userProfile, history = [] } = params;
        // 1. Generate query embedding
        const queryEmbedding = await this.geminiService.generateEmbedding(query);
        // 2. Vector similarity search with access control
        const searchResults = await this.vectorService.similaritySearch({
            embedding: queryEmbedding,
            topK: 5,
            filters: {
                department: userProfile.department,
                role: userProfile.role
            }
        });
        // 3. Build context from results
        if (searchResults.length === 0) {
            // Audit: Log query with no results
            await this.auditService.log({
                userId,
                action: 'RAG_QUERY',
                query,
                granted: true,
                reason: 'No matching documents found'
            });
            return {
                answer: "I couldn't find any documents in the knowledge base that match your query.",
                sources: [],
                usage: undefined
            };
        }
        // 4. Build context from results with Token Cap
        // Limit total context size to prevent token exhaustion/cost spikes.
        // Assuming ~4 chars per token, 20,000 chars is ~5k tokens, safe for Gemini Flash.
        const MAX_CONTEXT_CHARS = 20000;
        let currentLength = 0;
        const context = [];
        for (const res of searchResults) {
            let text = res.metadata.text || '';
            // SECURITY: Redact PII before sending to LLM
            text = this.redactionService.redactPII(text);
            if (currentLength + text.length > MAX_CONTEXT_CHARS) {
                const remaining = MAX_CONTEXT_CHARS - currentLength;
                if (remaining > 0) {
                    context.push(`SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text.substring(0, remaining)}...[TRUNCATED]`);
                }
                break;
            }
            context.push(`SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text}`);
            currentLength += text.length;
        }
        // 5. Generate response with Gemini
        const response = await this.geminiService.queryKnowledgeBase({
            query,
            context,
            userProfile,
            history
        });
        // Handle Ghost Files
        // Filter out undefined IDs to ensure valid sources
        const validSources = searchResults
            .map(res => ({
            id: res.id,
            docId: res.metadata.docId,
            title: res.metadata.title,
            score: res.score,
        }))
            .filter(s => s.docId && s.id);
        // 6. Audit: Log successful query
        await this.auditService.log({
            userId,
            action: 'RAG_QUERY',
            resourceId: validSources.map(s => s.docId).join(','),
            query,
            granted: true,
            reason: `Retrieved ${validSources.length} sources`
        });
        return {
            answer: response.text,
            sources: validSources,
            usage: response.usageMetadata
        };
    }
}
//# sourceMappingURL=rag.service.js.map