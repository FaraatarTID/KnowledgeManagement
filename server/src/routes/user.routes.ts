import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', authMiddleware, requireRole('ADMIN', 'MANAGER'), UserController.list);
router.post('/', authMiddleware, requireRole('ADMIN'), UserController.create);
router.patch('/:id', authMiddleware, requireRole('ADMIN'), UserController.update);
router.delete('/:id', authMiddleware, requireRole('ADMIN'), UserController.delete);
router.patch('/:id/password', authMiddleware, requireRole('ADMIN'), UserController.updatePassword);

export default router;
