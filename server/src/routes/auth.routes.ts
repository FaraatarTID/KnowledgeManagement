import { Router } from 'express';
import type { RequestHandler } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema } from '../schemas/auth.schema.js';

const router = Router();

router.post('/login', 
    authLimiter, 
    validateBody(loginSchema), 
    AuthController.login as RequestHandler
);

router.post('/logout', 
    AuthController.logout as RequestHandler
);

router.get('/me', 
    authMiddleware, 
    AuthController.me as RequestHandler
);

export default router;
