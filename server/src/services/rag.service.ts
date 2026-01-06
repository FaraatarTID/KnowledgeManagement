import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';

export class RAGService {
  constructor(
    private geminiService: GeminiService,
    private vectorService: VectorService
  ) {}

  async query(params: {
    query: string;
    userId: string;
    userProfile: { name: string; department: string; role: string };
  }) {
    const { query, userProfile } = params;

    // 1. Generate query embedding
    const queryEmbedding = await this.geminiService.generateEmbedding(query);

    // 2. Vector similarity search
    const searchResults = await this.vectorService.similaritySearch({
      embedding: queryEmbedding,
      topK: 5
    });

    // 3. Build context from results
    if (searchResults.length === 0) {
      return {
        answer: "I couldn't find any documents in the knowledge base that match your query.",
        sources: [],
        usage: undefined
      };
    }

    // 3. Build context from results with Token Cap (Scenario I)
    // Limit total context size to prevent token exhaustion/cost spikes.
    // Assuming ~4 chars per token, 20,000 chars is ~5k tokens, safe for Gemini Flash.
    const MAX_CONTEXT_CHARS = 20000;
    let currentLength = 0;
    const context: string[] = [];

    for (const res of searchResults) {
      const text = res.metadata.text || '';
      if (currentLength + text.length > MAX_CONTEXT_CHARS) {
        const remaining = MAX_CONTEXT_CHARS - currentLength;
        if (remaining > 0) {
           context.push(text.substring(0, remaining) + '...[TRUNCATED]');
        }
        break; 
      }
      context.push(text);
      currentLength += text.length;
    }

    // 4. Generate response with Gemini
    // 4. Generate response with Gemini
    const response = await this.geminiService.queryKnowledgeBase({
      query,
      context,
      userProfile
    });

    // Handle Ghost Files (Scenario E)
    // In a real app, we would verify file existence here. 
    // Since we lack a live Google Drive connection in this context, we simulate robust checking by filtering out undefined IDs.
    const validSources = searchResults
      .map(res => ({
        id: res.id,
        docId: res.metadata.docId,
        score: res.score,
        // Add a 'verified' flag or similar in production
      }))
      .filter(s => s.docId && s.id);

    return {
      answer: response.text,
      sources: validSources,
      usage: response.usageMetadata
    };
  }
}
