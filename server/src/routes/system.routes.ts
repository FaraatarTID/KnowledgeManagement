import { Router } from 'express';
import { SystemController } from '../controllers/system.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Public
router.get('/ping', SystemController.ping);
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'aikb-api' }));

// Auth Required
router.get('/config', authMiddleware, SystemController.getConfig);

// Admin / Manager
router.get('/system/health', authMiddleware, requireRole('ADMIN'), SystemController.health);
router.get('/system/sync-status', authMiddleware, requireRole('ADMIN'), SystemController.syncStatus);
router.get('/stats', authMiddleware, requireRole('ADMIN', 'MANAGER'), SystemController.stats);

// Admin Only
router.patch('/config/categories', authMiddleware, requireRole('ADMIN'), SystemController.updateCategories);
router.patch('/config/departments', authMiddleware, requireRole('ADMIN'), SystemController.updateDepartments);

// History route mentioned in api.routes.ts seems to be duplicate of stats/activity
// Original: router.get('/history', authMiddleware, requireRole('ADMIN', 'MANAGER'), ...)
// Let's add it if it's separate. 
// Ah, historyService.getHistory() was used.
import { historyService } from '../container.js';
router.get('/history', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req, res) => {
    const history = await historyService.getHistory();
    res.json(history);
});

export default router;
