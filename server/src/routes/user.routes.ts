import { Router } from 'express';
import type { RequestHandler } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { validate, validateBody } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { 
  createUserSchema, 
  updateUserSchema, 
  updatePasswordSchema, 
  userIdSchema 
} from '../schemas/user.schema.js';

const router = Router();

router.get('/', 
  authMiddleware, 
  requireRole('ADMIN', 'MANAGER'), 
  UserController.list as RequestHandler
);

router.post('/', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validateBody(createUserSchema), 
  UserController.create as RequestHandler
);

router.patch('/:id', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validate(z.object({ params: userIdSchema, body: updateUserSchema })), 
  UserController.update as RequestHandler
);

router.delete('/:id', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validate(z.object({ params: userIdSchema })), 
  UserController.delete as RequestHandler
);

router.patch('/:id/password', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validate(z.object({ params: userIdSchema, body: updatePasswordSchema })), 
  UserController.updatePassword as RequestHandler
);

export default router;
