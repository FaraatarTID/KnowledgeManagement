import { Router } from 'express';
import type { RequestHandler } from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { resourceLimiter } from '../middleware/rateLimit.middleware.js';
import { querySchema } from '../schemas/chat.schema.js';

const router = Router();

// Modern RAG endpoint
router.post('/query', 
  authMiddleware, 
  resourceLimiter,
  validateBody(querySchema), 
  ChatController.query as RequestHandler
);

export default router;
