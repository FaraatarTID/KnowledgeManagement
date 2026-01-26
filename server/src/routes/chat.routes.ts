import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Modern RAG endpoint
router.post('/query', authMiddleware, ChatController.query);

// Legacy endpoints
router.post('/chat', authMiddleware, ChatController.chat);
router.post('/chat/legacy', authMiddleware, ChatController.legacyChat);

export default router;
