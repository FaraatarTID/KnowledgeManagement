import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';
import { RedactionService } from './redaction.service.js';
import { AuditService } from './access.service.js';

export class RAGService {
  private redactionService: RedactionService;
  private auditService: AuditService;

  constructor(
    private geminiService: GeminiService,
    private vectorService: VectorService
  ) {
    this.redactionService = new RedactionService();
    this.auditService = new AuditService();
  }

  async query(params: {
    query: string;
    userId: string;
    userProfile: { name: string; department: string; role: string };
    history?: { role: 'user' | 'model'; content: string }[];
  }) {
    const { query, userId, userProfile, history = [] } = params;

    // 1. Generate query embedding
    const queryEmbedding = await this.geminiService.generateEmbedding(query);

    // 2. Vector similarity search with access control
    const searchResults = await this.vectorService.similaritySearch({
      embedding: queryEmbedding,
      topK: 10, // Increased from 5 to 10 for better depth
      filters: {
        department: userProfile.department,
        role: userProfile.role
      }
    });

    // 3. Filter by Similarity Threshold
    // If the best match score is too low (e.g. < 0.60), we assume it's "noise" and return early.
    // This is a HARD GATE against hallucination on irrelevant data.
    const MIN_SIMILARITY_SCORE = 0.60;
    const relevantResults = searchResults.filter(res => (res as any).score >= MIN_SIMILARITY_SCORE);

    if (relevantResults.length === 0) {
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
    // Increased from 20k to 100k to prevent "oversimplification" by providing full document nuances.
    const MAX_CONTEXT_CHARS = 100000;
    let currentLength = 0;
    const context: string[] = [];

    for (const res of relevantResults) {
      let text = res.metadata.text || '';
      
      // SECURITY: Redact PII before sending to LLM
      text = this.redactionService.redactPII(text);
      
      const sourceBlock = `SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text}`;
      
      // LOGICAL FIX: Chunk-aware truncation.
      // If adding this chunk exceeds limit, we stop. We don't want partial chunks confusing the LLM.
      if (currentLength + sourceBlock.length > MAX_CONTEXT_CHARS) {
        // Exception: If it's the first result and it's already too big, we HAVE to truncate or we have no context.
        if (context.length === 0) {
           const remaining = MAX_CONTEXT_CHARS;
           context.push(`SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text.substring(0, remaining)}...[TRUNCATED]`);
        }
        break; 
      }
      
      context.push(sourceBlock);
      currentLength += sourceBlock.length;
    }

    // STRATEGIC FIX: Capture citations for Audit log
    const citations = relevantResults.map(r => ({
      id: (r.metadata as any).docId,
      title: (r.metadata as any).title,
      sensitivity: (r.metadata as any).sensitivity
    }));

    // 5. Generate response with Gemini
    const { text, usageMetadata } = await this.geminiService.queryKnowledgeBase({
      query,
      context,
      userProfile,
      history
    });

    // --- INTEGRITY ENGINE: Post-Generation Verification ---
    const integrityResults = this.verifyIntegrity(text, context);

    // 6. Audit Logging (Improved with Integrity Metadata)
    await this.auditService.log({
      userId: userId || 'anonymous',
      action: 'RAG_QUERY',
      query,
      granted: true,
      resourceId: citations[0]?.id,
      metadata: {
        citations,
        usage: usageMetadata,
        sourceCount: relevantResults.length,
        integrity: integrityResults
      }
    });

    return {
      answer: text,
      sources: citations,
      usage: usageMetadata,
      integrity: integrityResults
    };
  }

  /**
   * Verifies the AI's reported quotes against the actual retrieved context.
   */
  private verifyIntegrity(aiText: string, searchContext: string[]): any {
    const quotes = aiText.match(/\[QUOTE\]: "(.*?)"/g) || [];
    const verifiedQuotes = quotes.map(q => {
      const quoteText = q.replace('[QUOTE]: "', '').replace(/"$/, '');
      // Check if this quote exists in ANY of the source blocks
      const exists = searchContext.some(ctx => ctx.includes(quoteText));
      return { quote: quoteText, verified: exists };
    });

    const confidenceMatch = aiText.match(/\[CONFIDENCE\]: (High|Medium|Low)/i);
    const confidence = confidenceMatch ? confidenceMatch[1] : 'Unknown';

    const hallucinatedQuoteCount = verifiedQuotes.filter(v => !v.verified).length;
    const isCompromised = hallucinatedQuoteCount > 0;

    return {
      confidence,
      isVerified: !isCompromised,
      hallucinatedQuoteCount,
      verifiedQuoteCount: verifiedQuotes.length - hallucinatedQuoteCount,
      details: verifiedQuotes
    };
  }
}
