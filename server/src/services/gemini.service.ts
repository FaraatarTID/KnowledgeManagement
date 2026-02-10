import { VertexAI, GenerativeModel as VertexModel } from '@google-cloud/vertexai';
import { GoogleGenerativeAI, GenerativeModel as AIStudioModel } from '@google/generative-ai';
import { Logger } from '../utils/logger.js';
import { EmbeddingCache } from '../utils/cache.util.js';

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; 
  failureCount: number;
  lastFailureTime?: number;
  successCountInHalfOpen: number;
}

export class GeminiService {
  private vertexAI?: VertexAI;
  private googleAI?: GoogleGenerativeAI;
  private model?: VertexModel | AIStudioModel;
  private embeddingModel?: VertexModel | AIStudioModel;
  private embeddingCache: EmbeddingCache;
  private isVertex: boolean = true;
  
  private circuitBreaker: CircuitBreakerState = {
    state: 'CLOSED',
    failureCount: 0,
    successCountInHalfOpen: 0
  };

  private readonly FAILURE_THRESHOLD = 5;
  private readonly HALF_OPEN_TIMEOUT = 30000;
  private readonly HALF_OPEN_MAX_REQUESTS = 3;
  private readonly HALF_OPEN_SUCCESS_THRESHOLD = 2;

  constructor(projectIdOrApiKey: string, location: string = 'us-central1', isApiKey: boolean = false) {
    const modelName = process.env.GEMINI_MODEL || 'gemini-flash-latest';
    const embedName = process.env.EMBEDDING_MODEL || 'text-embedding-004';

    if (isApiKey) {
      this.isVertex = false;
      this.googleAI = new GoogleGenerativeAI(projectIdOrApiKey);
      this.model = this.googleAI.getGenerativeModel({ model: modelName });
      this.embeddingModel = this.googleAI.getGenerativeModel({ model: embedName });
      Logger.info('GeminiService: Initialized with Gemini API Key (AI Studio)');
    } else {
      this.isVertex = true;
      this.vertexAI = new VertexAI({
        project: projectIdOrApiKey,
        location: location
      });

      this.model = this.vertexAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          maxOutputTokens: 8192,
          temperature: 0.2,
          topP: 0.8,
          topK: 40
        }
      });

      this.embeddingModel = this.vertexAI.getGenerativeModel({
        model: embedName
      });
      Logger.info('GeminiService: Initialized with Vertex AI', { project: projectIdOrApiKey });
    }

    this.embeddingCache = new EmbeddingCache();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.circuitBreaker.state === 'OPEN') {
      Logger.warn('GeminiService: Circuit breaker OPEN - embedding request rejected');
      throw new Error('Gemini API temporarily unavailable (circuit breaker open)');
    }

    if (!this.embeddingModel) {
      throw new Error('GeminiService: Embedding model not initialized');
    }

    try {
      const cacheKey = EmbeddingCache.generateKey(text);
      const cached = this.embeddingCache.get(cacheKey);
      
      if (cached) {
        Logger.debug('GeminiService: Cache hit for embedding', { textLength: text.length });
        return cached;
      }

      let embedding: number[] = [];

      if (this.isVertex) {
        const result = await (this.embeddingModel as any).embedContent({
          content: { role: 'user', parts: [{ text }] }
        });
        const response = result.response;
        embedding = response.embeddings?.[0]?.values || [];
      } else {
        const result = await (this.embeddingModel as any).embedContent(text);
        embedding = result.embedding.values || [];
      }

      this.recordSuccess();

      if (embedding.length > 0) {
        this.embeddingCache.set(cacheKey, embedding);
      }

      return embedding;
    } catch (error: any) {
      this.recordFailure(error);
      Logger.error('GeminiService: Embedding generation failed', {
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
    if (this.circuitBreaker.state === 'OPEN') {
      Logger.warn('GeminiService: Circuit breaker OPEN - query request rejected');
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

    if (!this.model) {
      throw new Error('GeminiService: Generative model not initialized');
    }

    try {
      const { query, context, userProfile, history = [] } = params;
      const historyText = history.length > 0
        ? `\n\nConversation History:\n${history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')}`
        : '';

      const sanitizedContext = context.map(c => {
        let s = c;
        s = s.replace(/</g, '〈').replace(/>/g, '〉');
        s = s.replace(/^(ignore|forget|disregard|override|system:|assistant:|user:)/gim, '[$1]');
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

      let text = '';
      let usageMetadata: any = undefined;

      if (this.isVertex) {
        const result = await (this.model as VertexModel).generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
        const response = result.response;
        text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
        usageMetadata = response.usageMetadata;
      } else {
        const result = await (this.model as AIStudioModel).generateContent(prompt);
        const response = await result.response;
        text = response.text();
        usageMetadata = response.usageMetadata;
      }

      this.recordSuccess();
      return { text, usageMetadata };
    } catch (error: any) {
      this.recordFailure(error);
      Logger.error('GeminiService: Query generation failed', {
        error: error.message,
        circuitState: this.circuitBreaker.state
      });

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
      await this.generateEmbedding('healthcheck');
      return { status: 'OK', message: `Connected to Gemini (${this.isVertex ? 'Vertex' : 'AI Studio'})` };
    } catch (e: any) {
      return { status: 'ERROR', message: `Gemini Error: ${e.message}` };
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
        Logger.info('GeminiService: Circuit breaker CLOSED - service recovered');
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
      Logger.warn('GeminiService: Recovery test failed - circuit breaker OPEN');
      return;
    }

    if (this.circuitBreaker.state === 'CLOSED') {
      this.circuitBreaker.failureCount++;

      if (this.circuitBreaker.failureCount >= this.FAILURE_THRESHOLD) {
        this.circuitBreaker.state = 'OPEN';
        Logger.warn('GeminiService: Failure threshold reached - circuit breaker OPEN', {
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
        Logger.info('GeminiService: Circuit breaker HALF_OPEN - attempting recovery');
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
