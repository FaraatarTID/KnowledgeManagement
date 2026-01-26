import { Request, Response } from 'express';
import { z } from 'zod';
import { chatService, ragService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

const querySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(2000, 'Query too long (max 2000 chars)')
});

export class ChatController {
  
  /**
   * Modern RAG Query
   * Frontend sends ONLY the query
   */
  static async query(req: AuthRequest, res: Response) {
    try {
      const parsed = querySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ 
          error: 'Invalid query', 
          details: parsed.error.issues.map(i => i.message)
        });
      }
      
      const { query } = parsed.data;
      const user = req.user!; // Middleware guarantees user exists

      const result = await ragService.query({
        query,
        userId: user.id || 'anonymous',
        userProfile: {
          name: user.name || 'User',
          department: user.department || 'General',
          role: user.role || 'IC'
        }
      });

      res.json(result);
    } catch (error: any) {
      console.error('Query error:', error);
      res.status(500).json({ error: 'Failed to process query' });
    }
  }

  /**
   * LEGACY BEHAVIOR: `/chat` expects callers to include `documents` in the body.
   * Kept for backward compatibility.
   */
  static async chat(req: AuthRequest, res: Response) {
    const { query } = req.body;

    if (!('documents' in req.body)) {
      return res.status(400).json({ message: 'Invalid request. `documents` array is required for /chat legacy endpoint.' });
    }

    const { documents } = req.body;
    if (!Array.isArray(documents)) {
      return res.status(400).json({ message: 'Invalid documents. Must be an array.' });
    }

    const invalidDocs = documents.filter((doc: any) => !doc || typeof doc.id !== 'string' || typeof doc.content !== 'string');
    if (invalidDocs.length > 0) {
      return res.status(400).json({ message: 'Invalid document structure. Each document must have id and content.' });
    }

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ message: 'Invalid query. Must be a non-empty string.' });
    }

    try {
      const aiResponse = await chatService.queryChatLegacy(query, documents);
      return res.json({ content: aiResponse });
    } catch (error: any) {
      console.error('Error in legacy chat handling inside /chat:', error);
      return res.status(500).json({ message: 'Failed to process chat request.', error: String((error as any)?.message ?? error) });
    }
  }

  /**
   * Explicit Legacy Endpoint
   * @deprecated
   */
  static async legacyChat(req: AuthRequest, res: Response) {
    const { query, documents } = req.body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ message: 'Invalid query. Must be a non-empty string.' });
    }

    if (!documents || !Array.isArray(documents)) {
      return res.status(400).json({ message: 'Invalid documents. Must be an array.' });
    }

    if (documents.length > 100) {
      return res.status(400).json({ message: 'Too many documents. Maximum 100 allowed.' });
    }

    const invalidDocs = documents.filter(doc => 
      !doc || typeof doc.id !== 'string' || typeof doc.content !== 'string'
    );

    if (invalidDocs.length > 0) {
      return res.status(400).json({ message: 'Invalid document structure. Each document must have id and content.' });
    }

    try {
      const aiResponse = await chatService.queryChatLegacy(query, documents);
      res.json({ content: aiResponse });
    } catch (error) {
      console.error('Error in legacy chat endpoint:', error);
      res.status(500).json({ message: 'Failed to process chat request.', error: String((error as any)?.message ?? error) });
    }
  }
}
