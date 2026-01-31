import { env } from '../config/env.js';
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
    const relevantResults = searchResults.filter(res => (res as any).score >= env.RAG_MIN_SIMILARITY);

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
    const MAX_CONTEXT_CHARS = env.RAG_MAX_CONTEXT_CHARS;
    let currentLength = 0;
    const context: string[] = [];
    let isTruncated = false;

    for (const res of relevantResults) {
      let text = res.metadata.text || '';
      
      // SECURITY: Redact PII before sending to LLM
      text = this.redactionService.redactPII(text);
      
      const sourceBlock = `SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text}`;
      
      if (currentLength + sourceBlock.length > MAX_CONTEXT_CHARS) {
        isTruncated = true;
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
    const citations = relevantResults.slice(0, context.length).map(r => ({
      id: (r.metadata as any).docId,
      title: (r.metadata as any).title,
      sensitivity: (r.metadata as any).sensitivity
    }));

    // SECURITY: Handle empty context edge case before calling Gemini
    if (context.length === 0) {
      await this.auditService.log({
        userId,
        action: 'RAG_QUERY',
        query,
        granted: true,
        reason: 'Context empty after filtering'
      });

      return {
        answer: "I couldn't find any documents in the knowledge base that match your query.",
        sources: [],
        usage: undefined,
        integrity: { confidence: 'LOW', isVerified: false, reason: 'No context' }
      };
    }

    // 5. Generate response with Gemini
    const { text, usageMetadata } = await this.geminiService.queryKnowledgeBase({
      query,
      context,
      userProfile,
      history
    });

    // PARSE JSON RESPONSE
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(text);
    } catch (e) {
      console.error('RAGService: Failed to parse Gemini JSON response', text);
      // Fallback if JSON fails
      parsedResponse = {
        answer: text,
        confidence: 'Low',
        citations: [],
        missing_information: 'Error parsing AI response structure'
      };
    }

    // --- INTEGRITY ENGINE: Post-Generation Verification ---
    const integrityResults = this.verifyIntegrity(parsedResponse, context);
    if (isTruncated) {
       integrityResults.warning = "Context window limit reached. Some documents were partially omitted.";
       integrityResults.isTruncated = true;
    }

    // 6. Audit Logging (Improved with Integrity Metadata)
    await this.auditService.log({
      userId: userId || 'anonymous',
      action: 'RAG_QUERY',
      query,
      granted: true,
      resourceId: citations[0]?.id,
      metadata: {
        citations: parsedResponse.citations, // Use AI-generated citations for audit accuracy
        usage: usageMetadata,
        sourceCount: relevantResults.length,
        integrity: integrityResults,
        isTruncated
      }
    });

    return {
      answer: parsedResponse.answer,
      sources: citations, // Keep returning source documents metadata
      ai_citations: parsedResponse.citations, // Return specific AI citations
      usage: usageMetadata,
      integrity: integrityResults,
      isTruncated
    };
  }

  /**
   * Verifies the AI's reported quotes against the actual retrieved context.
   * NOW USES STRUCTURED JSON CITATIONS.
   */
  private verifyIntegrity(parsedResponse: any, searchContext: string[]): any {
    const citations = Array.isArray(parsedResponse.citations) ? parsedResponse.citations : [];
    
    const verifiedCitations = citations.map((cit: any) => {
      const quote = cit.quote || '';
      // Sanitize slightly
      const cleanQuote = quote.trim();
      
      if (cleanQuote.length < 5) {
        return { ...cit, verified: false, reason: 'Quote too short' };
      }

      // Check existence
      const exists = searchContext.some(ctx => ctx.includes(cleanQuote));
      return { ...cit, verified: exists };
    });

    const hallucinatedCount = verifiedCitations.filter((c: any) => !c.verified).length;
    const isCompromised = hallucinatedCount > 0;

    return {
      confidence: parsedResponse.confidence || 'Unknown',
      isVerified: !isCompromised,
      hallucinatedQuoteCount: hallucinatedCount,
      verifiedQuoteCount: verifiedCitations.length - hallucinatedCount,
      details: verifiedCitations,
      integrityScore: verifiedCitations.length > 0 
        ? (verifiedCitations.length - hallucinatedCount) / verifiedCitations.length 
        : 1 // If no citations needed (e.g. greeting), integrity is high 
    };
  }
}
