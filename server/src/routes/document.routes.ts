import { Router } from 'express';
import { DocumentController } from '../controllers/document.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';

const router = Router();

// Upload
router.post('/upload', authMiddleware, requireRole('ADMIN', 'MANAGER'), uploadMiddleware.single('file'), DocumentController.upload);

// List
router.get('/documents', authMiddleware, DocumentController.list);

// Sync (Global) - NOTE: This was at /sync in api.routes.ts, now mounted at /documents/sync or /sync?
// The original was router.post('/sync', ...). 
// I will keep it in api.routes.ts or mount it here. 
// If I mount this router at /documents, then this becomes /documents/sync. 
// If I want /sync, I might need a separate route or alias in api.routes.ts.
// For now, let's keep it here and I'll handle the mounting path in api.routes.ts.
// Actually, to handle POST /sync, I should probably put it in api.routes.ts pointing to DocumentController.syncAll
// OR, I can add it here and the mount path will deterine the URL.

// Admin Operations
router.patch('/documents/:id', authMiddleware, DocumentController.update); // Access check is inside controller (Admin/Manager)
router.delete('/documents/:id', authMiddleware, DocumentController.delete); // Admin only in original route
router.post('/documents/:id/sync', authMiddleware, requireRole('ADMIN'), DocumentController.syncOne);

// Global Sync
router.post('/sync', authMiddleware, requireRole('ADMIN'), DocumentController.syncAll);

export default router;
