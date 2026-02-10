import { Router } from 'express';
import type { RequestHandler } from 'express';
import { SystemController } from '../controllers/system.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { updateCategoriesSchema, updateDepartmentsSchema } from '../schemas/system.schema.js';
import { historyService } from '../container.js';
import { catchAsync } from '../utils/catchAsync.js';

const router = Router();

// Public
router.get('/ping', SystemController.ping as RequestHandler);
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'aikb-api' }));

// Auth Required
router.get('/config', authMiddleware, SystemController.getConfig as RequestHandler);

// Admin / Manager
router.get('/system/health', authMiddleware, requireRole('ADMIN'), SystemController.health as RequestHandler);
router.post('/system/cloud-backup', authMiddleware, requireRole('ADMIN'), SystemController.cloudBackup as RequestHandler);
router.get('/system/sync-status', authMiddleware, requireRole('ADMIN'), SystemController.syncStatus as RequestHandler);
router.get('/stats', authMiddleware, requireRole('ADMIN', 'MANAGER'), SystemController.stats as RequestHandler);

// Admin Only
router.patch('/config/categories', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validateBody(updateCategoriesSchema), 
  SystemController.updateCategories as RequestHandler
);

router.patch('/config/departments', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validateBody(updateDepartmentsSchema), 
  SystemController.updateDepartments as RequestHandler
);

router.get('/history', 
  authMiddleware, 
  requireRole('ADMIN', 'MANAGER'), 
  catchAsync(async (req, res) => {
    const history = await historyService.getHistory();
    res.json(history);
  })
);

export default router;
