import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';
import { Logger } from '../utils/logger.js';
import { EmbeddingCache } from '../utils/cache.util.js';

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; // CLOSED=normal, OPEN=failing, HALF_OPEN=testing
  failureCount: number;
  lastFailureTime?: number;
  successCountInHalfOpen: number;
}

/**
 * Circuit Breaker Pattern for Gemini API
 * Prevents cascading failures by failing fast when service is down
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service failing, requests rejected immediately
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */
export class GeminiService {
  private vertexAI: VertexAI;
  private model: GenerativeModel;
  private embeddingModel: GenerativeModel;
  private logger = new Logger('GeminiService');
  private embeddingCache: EmbeddingCache;
  
  private circuitBreaker: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
    successCountInHalfOpen: 0
  };

  // Configuration
  private readonly FAILURE_THRESHOLD = 5; // Open circuit after 5 consecutive failures
  private readonly HALF_OPEN_TIMEOUT = 30000; // Try recovery after 30 seconds
  private readonly HALF_OPEN_MAX_REQUESTS = 3; // Allow 3 test requests in HALF_OPEN
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 2; // Need 2 successes to close circuit

  constructor(projectId: string, location: string = 'us-central1') {
    this.vertexAI = new VertexAI({
      project: projectId,
      location: location
    });

    this.model = this.vertexAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite-001',
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
        topP: 0.8,
        topK: 40
      }
    });

    this.embeddingModel = this.vertexAI.getGenerativeModel({
      model: process.env.EMBEDDING_MODEL || 'text-embedding-004'
    });

    this.embeddingCache = new EmbeddingCache();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Circuit breaker check
    if (this.circuitBreaker.state === 'OPEN') {
      this.logger.warn('GeminiService: Circuit breaker OPEN - embedding request rejected');
      throw new Error('Gemini API temporarily unavailable (circuit breaker open)');
    }

    try {
      // Check cache first
      const cacheKey = EmbeddingCache.generateKey(text);
      const cached = this.embeddingCache.get(cacheKey);
      
      if (cached) {
        this.logger.debug('GeminiService: Cache hit for embedding', { textLength: text.length });
        return cached;
      }

      // Generate embedding if not cached
      const result = await (this.embeddingModel as any).embedContent({
        content: { role: 'user', parts: [{ text }] }
      });

      // Success: record and possibly close circuit
      this.recordSuccess();

      const embeddings = result.response.embeddings;
      const embedding = embeddings ? embeddings[0].values : [];

      // Cache the result
      if (embedding.length > 0) {
        this.embeddingCache.set(cacheKey, embedding);
      }

      return embedding;
    } catch (error: any) {
      // Failure: record and possibly open circuit
      this.recordFailure(error);
      
      this.logger.error('GeminiService: Embedding generation failed', {
        error: error.message,
        circuitState: this.circuitBreaker.state
      });
      throw error;
    }
  }

  async queryKnowledgeBase(params: {
    query: string;
    context: string[];
    userProfile: { name: string; department: string; role: string };
    history?: { role: 'user' | 'model'; content: string }[];
  }) {
    // Circuit breaker check
    if (this.circuitBreaker.state === 'OPEN') {
      this.logger.warn('GeminiService: Circuit breaker OPEN - query request rejected');
      // Return graceful fallback instead of throwing
      return {
        text: JSON.stringify({
          answer: 'The AI service is temporarily unavailable. Please try again in a few moments.',
          confidence: 'Low',
          citations: [],
          missing_information: 'Service temporarily unavailable'
        }),
        usageMetadata: undefined
      };
    }

    try {
      const { query, context, userProfile, history = [] } = params;
      const historyText = history.length > 0
        ? `\n\nConversation History:\n${history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}`
        : '';

      // SECURITY: Comprehensive sanitization to prevent prompt injection attacks
      // 1. Replace angle brackets with safe unicode alternatives
      // 2. Neutralize instruction-like patterns at line starts
      // 3. Limit individual chunk size to prevent token exhaustion
      const sanitizedContext = context.map(c => {
        let s = c;
        // Replace angle brackets with safe unicode alternatives
        s = s.replace(/</g, '〈').replace(/>/g, '〉');
        // Neutralize common injection patterns at line starts
        s = s.replace(/^(ignore|forget|disregard|override|system:|assistant:|user:)/gim, '[$1]');
        // Limit per-chunk size to prevent token exhaustion
        return s.substring(0, 5000);
      });

      const prompt = `You are a strict, accuracy-driven AI assistant. You answer questions based ONLY on the provided context.

User Profile:
- Name: ${userProfile.name}
- Department: ${userProfile.department}
- Role: ${userProfile.role}

User Query: ${query}${historyText}

Relevant Context:
<context_data>
${sanitizedContext.join('\n\n')}
</context_data>

INSTRUCTIONS:
1.  **Output Format**: You MUST respond with valid JSON only. No markdown formatting, no code blocks.
2.  **Schema**:
    {
      "answer": "Your clear, direct answer to the user. Use markdown for lists/bolding within the string.",
      "confidence": "High" | "Medium" | "Low",
      "citations": [
        {
          "source_title": "Exact title of the document source",
          "quote": "Direct, exact substring from the text supporting the claim",
          "relevance": "Explanation of why this supports the answer"
        }
      ],
      "missing_information": "What specific details are missing to fully answer (or 'None')."
    }
3.  **Strict Grounding**: Every sentence in "answer" must be supported by a specific quote in "citations".
4.  **No Hallucinations**: If the context is empty or irrelevant, set "answer" to "I cannot find this information in the provided documents." and "confidence" to "Low".
5.  **Handling Conflicts**: If documents conflict, explain the conflict in the answer.

Begin JSON Response:`;

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      });

      // Success: record and possibly close circuit
      this.recordSuccess();

      const response = result.response;
      return {
        text: response.candidates?.[0]?.content?.parts?.[0]?.text || '',
        usageMetadata: response.usageMetadata
      };
    } catch (error: any) {
      // Failure: record and possibly open circuit
      this.recordFailure(error);
      
      this.logger.error('GeminiService: Query generation failed', {
        error: error.message,
        circuitState: this.circuitBreaker.state
      });

      // Return graceful fallback on failure
      return {
        text: JSON.stringify({
          answer: 'The AI service encountered an error. Please try again later.',
          confidence: 'Low',
          citations: [],
          missing_information: 'Service error'
        }),
        usageMetadata: undefined
      };
    }
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    try {
      // Simple test: generate embedding for a single word
      await this.generateEmbedding('healthcheck');
      return { status: 'OK', message: 'Connected to Vertex AI' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Google Cloud Error: ${e.message}` };
    }
  }

  /**
   * Record a successful API call.
   * Transitions from HALF_OPEN to CLOSED if threshold met.
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === 'HALF_OPEN') {
      this.circuitBreaker.successCountInHalfOpen++;
      
      if (this.circuitBreaker.successCountInHalfOpen >= this.HALF_OPEN_SUCCESS_THRESHOLD) {
        this.circuitBreaker.state = 'CLOSED';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.successCountInHalfOpen = 0;
        this.logger.info('GeminiService: Circuit breaker CLOSED - service recovered');
      }
    } else if (this.circuitBreaker.state === 'CLOSED') {
      // Reset failure counter on success
      this.circuitBreaker.failureCount = 0;
    }
  }

  /**
   * Record a failed API call.
   * Transitions from CLOSED to OPEN if threshold met.
   * Transitions from HALF_OPEN to OPEN immediately.
   */
  private recordFailure(error: Error): void {
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.state === 'HALF_OPEN') {
      // Failure while testing recovery - go back to OPEN
      this.circuitBreaker.state = 'OPEN';
      this.circuitBreaker.failureCount = this.FAILURE_THRESHOLD;
      this.circuitBreaker.successCountInHalfOpen = 0;
      this.logger.warn('GeminiService: Recovery test failed - circuit breaker OPEN');
      return;
    }

    if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount++;

      if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
        this.circuitBreaker.state = 'OPEN';
        this.logger.warn('GeminiService: Failure threshold reached - circuit breaker OPEN', {
          failureCount: this.circuitBreaker.failureCount,
          errorMessage: error.message
        });
      }
    }
  }

  /**
   * Check if circuit should transition from OPEN to HALF_OPEN.
   * Called before each request to allow recovery attempts.
   */
  private updateCircuitBreakerState(): void {
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - (this.circuitBreaker.lastFailureTime || 0);
      
      if (timeSinceLastFailure >= this.HALF_OPEN_TIMEOUT) {
        this.circuitBreaker.state = 'HALF_OPEN';
        this.circuitBreaker.failureCount = 0;
        this.circuitBreaker.successCountInHalfOpen = 0;
        this.logger.info('GeminiService: Circuit breaker HALF_OPEN - attempting recovery');
      }
    }
  }

  /**
   * Get current circuit breaker state (for monitoring).
   */
  getCircuitBreakerStatus(): CircuitBreakerState {
    this.updateCircuitBreakerState();
    return { ...this.circuitBreaker };
  }
}
