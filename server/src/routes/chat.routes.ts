import { Router } from 'express';
import type { RequestHandler } from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { querySchema, legacyChatSchema } from '../schemas/chat.schema.js';

const router = Router();

// Modern RAG endpoint
router.post('/query', 
  authMiddleware, 
  validateBody(querySchema), 
  ChatController.query as RequestHandler
);

// Legacy endpoints
// Both /chat and /chat/legacy use the same schema structure
router.post('/chat', 
  authMiddleware, 
  validateBody(legacyChatSchema), 
  ChatController.chat as RequestHandler
);

router.post('/chat/legacy', 
  authMiddleware, 
  validateBody(legacyChatSchema), 
  ChatController.legacyChat as RequestHandler
);

export default router;
