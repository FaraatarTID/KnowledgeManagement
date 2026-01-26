import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.post('/login', authLimiter, AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);

export default router;
