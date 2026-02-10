import type { RequestHandler, Response } from 'express';
// Removed inline z import as validation is moved to middleware
import { chatService, ragService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { catchAsync } from '../utils/catchAsync.js';

export class ChatController {
  
  /**
   * Modern RAG Query
   * Frontend sends ONLY the query
   * Returns: { answer, sources, usage, integrity: { hallucinationScore, hallucinationVerdict, ... } }
   */
  static query: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    // Validation handled by middleware
    const { query } = req.body;
    const user = req.user!; 

    const result = await ragService.query({
      query,
      userId: user.id || 'anonymous',
      userProfile: {
        name: user.name || 'User',
        department: user.department || 'General',
        role: user.role || 'VIEWER'
      }
    });

    // Hallucination verdict is already integrated in integrity field
    // Client can check result.integrity.hallucinationVerdict === 'reject' to warn user
    // Client can check result.integrity.hallucinationScore for confidence display
    
    res.json(result);
  });

  /**
   * LEGACY BEHAVIOR: `/chat` expects callers to include `documents` in the body.
   * Kept for backward compatibility.
   */
  static chat: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { query, documents } = req.body;

    // Manual 'documents' check removed -> handled by Schema

    try {
      const aiResponse = await chatService.queryChatLegacy(query, documents);
      res.json({ content: aiResponse });
    } catch (error: any) {
      Logger.error('Legacy chat error', { error: error.message });
      res.status(500).json({ message: 'Failed to process chat request.', error: String((error as any)?.message ?? error) });
    }
  });

  /**
   * Explicit Legacy Endpoint
   * @deprecated
   */
  static legacyChat: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { query, documents } = req.body;

    // All validation logic moved to legacyChatSchema

    try {
      const aiResponse = await chatService.queryChatLegacy(query, documents);
      res.json({ content: aiResponse });
    } catch (error) {
      Logger.error('Legacy endpoint error', { error: (error as any).message });
      res.status(500).json({ message: 'Failed to process chat request.', error: String((error as any)?.message ?? error) });
    }
  });
}
