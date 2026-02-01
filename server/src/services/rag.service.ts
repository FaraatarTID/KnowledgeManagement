import { env } from '../config/env.js';
import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';
import { RedactionService } from './redaction.service.js';
import { AuditService } from './access.service.js';
import { HallucinationService } from './hallucination.service.js';
import { Logger } from '../utils/logger.js';
import { TimeoutUtil, REQUEST_TIMEOUTS } from '../utils/timeout.util.js';
import { encoding_for_model } from 'js-tiktoken';

export class RAGService {
  private redactionService: RedactionService;
  private auditService: AuditService;
  private hallucinationService: HallucinationService;
  private logger = new Logger('RAGService');
  private tokenEncoder = encoding_for_model('gpt-4');  // Use GPT-4 encoding for token counting

  constructor(
    private geminiService: GeminiService,
    private vectorService: VectorService
  ) {
    this.redactionService = new RedactionService();
    this.auditService = new AuditService();
    this.hallucinationService = new HallucinationService();
  }

  /**
   * Calculate estimated cost for RAG query
   */
  private calculateCost(inputTokens: number, outputTokens: number = 500): number {
    const inputCost = (inputTokens / 1000) * env.RAG_COST_PER_INPUT_K_TOKENS;
    const outputCost = (outputTokens / 1000) * env.RAG_COST_PER_OUTPUT_K_TOKENS;
    return inputCost + outputCost;
  }

  /**
   * Count tokens in text using GPT-4 tokenizer
   */
  private countTokens(text: string): number {
    try {
      return this.tokenEncoder.encode(text).length;
    } catch (e) {
      this.logger.warn('Token counting failed, using character fallback', { error: e });
      // Fallback: rough estimate (1 token ≈ 4 chars)
      return Math.ceil(text.length / 4);
    }
  }

  async query(params: {
    query: string;
    userId: string;
    userProfile: { name: string; department: string; role: string };
    history?: { role: 'user' | 'model'; content: string }[];
  }) {
    const { query, userId, userProfile, history = [] } = params;
    const operationDeadline = Date.now() + REQUEST_TIMEOUTS.RAG_QUERY;
    let totalInputTokens = 0;
    let estimatedCost = 0;

    try {
      // 1. Generate query embedding (with timeout)
      const queryEmbedding = await TimeoutUtil.timeout(
        this.geminiService.generateEmbedding(query),
        REQUEST_TIMEOUTS.EMBEDDING_GENERATION,
        'RAG: Embedding generation'
      );
      
      // Embedding generation cost (fixed per request)
      estimatedCost += 0.001;
      totalInputTokens += this.countTokens(query);

      // 2. Vector similarity search with access control (with timeout)
      const searchResults = await TimeoutUtil.timeout(
        this.vectorService.similaritySearch({
          embedding: queryEmbedding,
          topK: 10, // Increased from 5 to 10 for better depth
          filters: {
            department: userProfile.department,
            role: userProfile.role
          }
        }),
        REQUEST_TIMEOUTS.VECTOR_SEARCH,
        'RAG: Vector search'
      );

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
          usage: undefined,
          integrity: { confidence: 'Low', isVerified: true, reason: 'No matching documents' }
        };
      }

      // 4. Build context from results with STRICT TOKEN BUDGET
      // CRITICAL FIX: Token counting + cost validation (not just character count)
    const context: string[] = [];
    let isTruncated = false;
    let contextTokens = 0;
    let blockCount = 0;

    for (const res of relevantResults) {
      // Stop if we'd exceed token limit
      if (totalInputTokens + contextTokens > env.RAG_MAX_INPUT_TOKENS) {
        isTruncated = true;
        this.logger.warn('RAG: Truncating context due to token limit', { 
          currentTokens: totalInputTokens + contextTokens,
          maxTokens: env.RAG_MAX_INPUT_TOKENS,
          blocksAdded: blockCount
        });
        break;
      }

      let text = res.metadata.text || '';
      
      // SECURITY: Redact PII before sending to LLM
      text = this.redactionService.redactPII(text);
      
      const sourceBlock = `SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${text}`;
      const blockTokens = this.countTokens(sourceBlock);
      
      // CRITICAL: Check if adding this block would exceed limits
      if (totalInputTokens + contextTokens + blockTokens > env.RAG_MAX_INPUT_TOKENS) {
        isTruncated = true;
        // Try to add partial content if this is first block
        if (blockCount === 0) {
          const availableTokens = env.RAG_MAX_INPUT_TOKENS - totalInputTokens;
          // Rough estimate: truncate to ~85% of available tokens
          const truncatedText = text.substring(0, Math.floor(text.length * 0.85));
          const truncatedBlock = `SOURCE: ${res.metadata.title || 'Untitled'}\nCONTENT: ${truncatedText}\n...[TRUNCATED - token limit reached]`;
          context.push(truncatedBlock);
          contextTokens += this.countTokens(truncatedBlock);
        }
        break;
      }
      
      context.push(sourceBlock);
      contextTokens += blockTokens;
      blockCount++;
    }

    totalInputTokens += contextTokens;
    estimatedCost = this.calculateCost(totalInputTokens);

    // CRITICAL FIX: Reject if estimated cost exceeds limit
    if (estimatedCost > env.RAG_MAX_COST_PER_REQUEST) {
      this.logger.error('RAG: Query rejected due to cost limit', { 
        estimatedCost,
        maxCost: env.RAG_MAX_COST_PER_REQUEST,
        userId,
        inputTokens: totalInputTokens
      });

      await this.auditService.log({
        userId: userId || 'anonymous',
        action: 'RAG_QUERY',
        query,
        granted: false,
        reason: `Query cost ($${estimatedCost.toFixed(2)}) exceeds limit ($${env.RAG_MAX_COST_PER_REQUEST})`
      });

      return {
        answer: 'Query is too expensive to process. Please try a more specific search.',
        sources: [],
        usage: undefined,
        integrity: {
          confidence: 'LOW',
          isVerified: false,
          reason: 'Cost limit exceeded',
          estimatedCost,
          inputTokens: totalInputTokens
        }
      };
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

    // 5. Generate response with Gemini (with timeout)
    // SECURITY: Redact PII from user query before sending to LLM
    const redactedQuery = this.redactionService.redactPII(query);

    const { text, usageMetadata } = await TimeoutUtil.timeout(
      this.geminiService.queryKnowledgeBase({
        query: redactedQuery,
        context,
        userProfile,
        history
      }),
      REQUEST_TIMEOUTS.RAG_QUERY - (Date.now() - operationDeadline), // Remaining time in RAG query
      'RAG: Gemini query'
    );

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

    // --- HALLUCINATION DETECTION: Multi-layer Verification ---
    let hallucinationAnalysis = null;
    let shouldRejectResponse = false;
    
    try {
      hallucinationAnalysis = await this.hallucinationService.analyze({
        query: redactedQuery,
        answer: parsedResponse.answer,
        context,
        citations: parsedResponse.citations?.map((c: any) => ({
          quote: c.quote || c.text || '',
          source: c.title || c.source || ''
        })) || [],
        aiConfidence: parsedResponse.confidence
      });

      // If verdict is 'reject', log warning and consider fallback response
      if (hallucinationAnalysis.verdict === 'reject') {
        this.logger.warn('Hallucination detected - verdict REJECT', {
          score: hallucinationAnalysis.score,
          issues: hallucinationAnalysis.issues.length
        });
        shouldRejectResponse = true;
      } else if (hallucinationAnalysis.verdict === 'caution') {
        this.logger.info('Hallucination caution flag', {
          score: hallucinationAnalysis.score,
          issues: hallucinationAnalysis.issues.map(i => i.type)
        });
      }
    } catch (error) {
      // If hallucination detection fails, log but don't block response
      this.logger.error('Hallucination detection error', { error });
      hallucinationAnalysis = null;
    }

    // --- INTEGRITY ENGINE: Post-Generation Verification ---
    const integrityResults = this.verifyIntegrity(parsedResponse, context);
    if (isTruncated) {
       integrityResults.warning = "Context window limit reached. Some documents were partially omitted.";
       integrityResults.isTruncated = true;
    }

    // Include hallucination analysis in integrity check
    if (hallucinationAnalysis) {
      integrityResults.hallucinationScore = hallucinationAnalysis.score;
      integrityResults.hallucinationVerdict = hallucinationAnalysis.verdict;
      integrityResults.hallucinationIssues = hallucinationAnalysis.issues;
    }

    // Include cost metadata
    integrityResults.estimatedCost = estimatedCost;
    integrityResults.inputTokens = totalInputTokens;

    // If hallucination detected as critical, return safer response
    if (shouldRejectResponse) {
      await this.auditService.log({
        userId: userId || 'anonymous',
        action: 'RAG_QUERY',
        query,
        granted: true,
        metadata: {
          hallucinationDetected: true,
          hallucinationScore: hallucinationAnalysis?.score,
          verdict: 'REJECTED',
          estimatedCost,
          inputTokens: totalInputTokens
        }
      });

      return {
        answer: 'The AI response contained potential inaccuracies. Please review the source documents directly or try rephrasing your question.',
        sources: citations.slice(0, 3),
        usage: usageMetadata,
        integrity: {
          confidence: 'LOW',
          isVerified: false,
          reason: 'Hallucination detected - response rejected for safety',
          hallucinationScore: hallucinationAnalysis?.score,
          hallucinationIssues: hallucinationAnalysis?.issues,
          estimatedCost,
          inputTokens: totalInputTokens
        }
      };
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
      operationTimeMsec: Date.now() - (operationDeadline - REQUEST_TIMEOUTS.RAG_QUERY)
    };
    } catch (error) {
      // Catch timeout and other errors
      Logger.error('RAGService: Query failed', {
        error: error instanceof Error ? error.message : String(error),
        userId
      });

      // Log failure to audit
      try {
        await this.auditService.log({
          userId: userId || 'anonymous',
          action: 'RAG_QUERY',
          query,
          granted: false,
          reason: `Query failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      } catch (auditError) {
        Logger.error('RAGService: Failed to log query failure', { auditError });
      }

      // Return error response
      return {
        answer: 'An error occurred while processing your query. Please try again.',
        sources: [],
        ai_citations: [],
        usage: undefined,
        integrity: {
          confidence: 'LOW',
          isVerified: false,
          reason: error instanceof Error ? error.message : 'Unknown error'
        }
      };
    }
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

      // PERFORMANCE: Normalize text for robust verification (fuzzy match)
      const normalize = (t: string) => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
      const normQuote = normalize(cleanQuote);
      
      const exists = searchContext.some(ctx => normalize(ctx).includes(normQuote));
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
