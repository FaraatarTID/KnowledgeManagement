import { GeminiService } from './gemini.service.js';
import { VectorService } from './vector.service.js';

interface Document {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: string;
}

export class ChatService {
  private geminiService: GeminiService;
  private vectorService: VectorService;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID; 
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID is not defined in environment variables.');
    }
    this.geminiService = new GeminiService(projectId);
    
    // Initialize vector service with mock mode support
    this.vectorService = new VectorService(projectId, 'us-central1');
  }

  /**
   * TRUE RAG IMPLEMENTATION
   * This method no longer receives documents from the frontend
   * Instead, it retrieves relevant documents from the vector database
   */
  async queryChat(query: string, userId?: string, userProfile?: { name: string; department: string; role: string }): Promise<string> {
    // SECURITY: Validate input
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Invalid query parameter');
    }

    // Default user profile for backward compatibility
    const safeProfile = userProfile || { name: 'User', department: 'General', role: 'VIEWER' };

    try {
      // STEP 1: Generate embedding for the query
      const queryEmbedding = await this.geminiService.generateEmbedding(query);

      // STEP 2: Vector similarity search with access control
      // This retrieves only the most relevant documents based on semantic similarity
      const searchResults = await this.vectorService.similaritySearch({
        embedding: queryEmbedding,
        topK: 3, // Retrieve top 3 most relevant documents
        filters: {
          department: safeProfile.department,
          role: safeProfile.role
        }
      });

      // STEP 3: Filter by similarity threshold to prevent hallucination
      const MIN_SIMILARITY_SCORE = 0.60;
      const relevantResults = searchResults.filter((res: any) => res.score >= MIN_SIMILARITY_SCORE);

      if (relevantResults.length === 0) {
        return "بر اساس اسناد موجود، اطلاعاتی برای پاسخ به سوال شما یافت نشد. لطفا سوال خود را با جزئیات بیشتری بیان کنید.";
      }

      // STEP 4: Format context for AI
      const context = relevantResults.map((result: any, idx: number) => {
        const metadata = result.metadata || {};
        return `[سند ${idx + 1}: ${metadata.title || 'Untitled'}]\nدسته‌بندی: ${metadata.category || 'General'}\nمحتوا: ${metadata.text || metadata.content || ''}\n`;
      }).join('\n---\n\n');

      // STEP 5: Query AI with retrieved context
      const result = await this.geminiService.queryKnowledgeBase({
        query: query,
        context: [context],
        userProfile: safeProfile
      });

      return result.text;

    } catch (error) {
      console.error('Error in RAG query:', error);
      throw new Error('Failed to process query with RAG');
    }
  }

  /**
   * LEGACY METHOD - Kept for backward compatibility during transition
   * @deprecated Use queryChat with proper RAG instead
   */
  async queryChatLegacy(query: string, documents: Document[]): Promise<string> {
    console.warn('WARNING: Legacy queryChat method called. This should be replaced with RAG implementation.');
    
    // Simple keyword-based search as a placeholder for RAG
    const relevantDocs = this.retrieveRelevantDocuments(query, documents);

    if (relevantDocs.length === 0) {
      return "بر اساس اسناد موجود، اطلاعاتی برای پاسخ به سوال شما یافت نشد.";
    }

    const context = relevantDocs.map((doc, idx) =>
      `[سند ${idx + 1}: ${doc.title}]\nدسته‌بندی: ${doc.category}\nمحتوا: ${doc.content}\n`
    ).join('\n---\n\n');

    const result = await this.geminiService.queryKnowledgeBase({
      query: query,
      context: [context],
      userProfile: { name: 'User', department: 'General', role: 'User' }
    });

    return result.text;
  }

  /**
   * Keyword-based search (legacy fallback)
   */
  private retrieveRelevantDocuments(query: string, documents: Document[]): Document[] {
    if (!query || typeof query !== 'string' || !Array.isArray(documents)) {
      return [];
    }

    const validDocuments = documents.filter(doc => 
      doc && 
      typeof doc.id === 'string' && 
      typeof doc.title === 'string' && 
      typeof doc.content === 'string'
    );

    if (validDocuments.length === 0) {
      return [];
    }

    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);
    if (keywords.length === 0) {
      return [];
    }

    const scoredDocs = validDocuments.map(doc => {
      let score = 0;
      const content = (doc.title + ' ' + doc.content + ' ' + doc.category).toLowerCase();
      keywords.forEach(keyword => {
        if (content.includes(keyword)) {
          score++;
        }
      });
      return { doc, score };
    }).filter(item => item.score > 0);

    return scoredDocs.sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.doc);
  }
}
