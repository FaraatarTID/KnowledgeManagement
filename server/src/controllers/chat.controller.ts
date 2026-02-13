import type { RequestHandler, Response } from 'express';
// Removed inline z import as validation is moved to middleware
import { ragService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { catchAsync } from '../utils/catchAsync.js';
import { AppError } from '../middleware/error.middleware.js';

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

    let result: any;
    try {
      result = await ragService.query({
        query,
        userId: user.id || 'anonymous',
        userProfile: {
          name: user.name || 'User',
          department: user.department || 'General',
          role: user.role || 'VIEWER'
        }
      });
    } catch (error: any) {
      Logger.error('ChatController: Modern query failed', { error: error?.message, userId: user.id });
      throw new AppError('Failed to process query request.', 503);
    }

    // Hallucination verdict is already integrated in integrity field
    // Client can check result.integrity.hallucinationVerdict === 'reject' to warn user
    // Client can check result.integrity.hallucinationScore for confidence display
    
    res.json(result);
  });

}
