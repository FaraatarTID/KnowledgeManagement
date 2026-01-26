import { Router } from 'express';
import type { RequestHandler } from 'express';
import { DocumentController } from '../controllers/document.controller.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { uploadMiddleware } from '../middleware/upload.middleware.js';

import { validate, validateBody } from '../middleware/validate.middleware.js';
import { z } from 'zod';
import { 
  updateDocumentSchema, 
  listDocumentsSchema, 
  documentIdSchema, 
  uploadDocumentSchema 
} from '../schemas/document.schema.js';

const router = Router();

// Upload 
router.post('/upload', 
  authMiddleware, 
  requireRole('ADMIN', 'MANAGER'), 
  uploadMiddleware.single('file'), 
  validateBody(uploadDocumentSchema),
  DocumentController.upload as RequestHandler
);

// List
router.get('/documents', 
  authMiddleware, 
  validate(z.object({ query: listDocumentsSchema })),
  DocumentController.list as RequestHandler
);

// Admin Operations
router.patch('/documents/:id', 
  authMiddleware, 
  validate(z.object({ params: documentIdSchema, body: updateDocumentSchema })),
  DocumentController.update as RequestHandler
);

router.delete('/documents/:id', 
  authMiddleware, 
  validate(z.object({ params: documentIdSchema })),
  DocumentController.delete as RequestHandler
);

router.post('/documents/:id/sync', 
  authMiddleware, 
  requireRole('ADMIN'), 
  validate(z.object({ params: documentIdSchema })),
  DocumentController.syncOne as RequestHandler
);

// Global Sync
router.post('/sync', 
  authMiddleware, 
  requireRole('ADMIN'), 
  DocumentController.syncAll as RequestHandler
);

export default router;
