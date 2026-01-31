import { VertexAI, GenerativeModel } from '@google-cloud/vertexai';

export class GeminiService {
  private vertexAI: VertexAI;
  private model: GenerativeModel;
  private embeddingModel: GenerativeModel;

  private isMock: boolean = false;

  constructor(projectId: string, location: string = 'us-central1') {
    if (projectId === 'aikb-mock-project') {
      console.log('GeminiService initialized in MOCK MODE.');
      this.isMock = true;
      // Initialize dummy objects to satisfy TypeScript, but they won't be used
      this.vertexAI = {} as any;
      this.model = {} as any;
      this.embeddingModel = {} as any;
      return;
    }

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
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (this.isMock) {
      // Return 768-dim dummy vector
      return new Array(768).fill(0).map(() => Math.random());
    }
    const result = await (this.embeddingModel as any).embedContent({
      content: { role: 'user', parts: [{ text }] }
    });
    const embeddings = result.response.embeddings;
    return embeddings ? embeddings[0].values : [];
  }

  async queryKnowledgeBase(params: {
    query: string;
    context: string[];
    userProfile: { name: string; department: string; role: string };
    history?: { role: 'user' | 'model'; content: string }[];
  }) {
    const { query, context, userProfile, history = [] } = params;

    if (this.isMock) {
      const historySummary = history.length > 0 ? ` with ${history.length} previous messages` : '';
      return {
        text: `[MOCK RESPONSE] Query: "${query}"${historySummary}.\nContext: ${context.length} relevant snippets found.\n\nReady for production data.`,
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }
      };
    }
    
    // Format conversation history
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

    const response = result.response;
    return {
      text: response.candidates?.[0]?.content?.parts?.[0]?.text || '',
      usageMetadata: response.usageMetadata
    };
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    if (this.isMock) return { status: 'OK', message: 'Mock Mode (No Google Cloud)' };
    try {
      // Simple test: generate embedding for a single word
      await this.generateEmbedding('healthcheck');
      return { status: 'OK', message: 'Connected to Vertex AI' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Google Cloud Error: ${e.message}` };
    }
  }
}
