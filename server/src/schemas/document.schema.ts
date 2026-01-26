import { z } from 'zod';

/**
 * Zod schemas for Document Routes.
 * Enforces strict typing and validation logic before the controller is even prioritized.
 */

export const updateDocumentSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  category: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  sensitivity: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'EXECUTIVE']).optional(),
}).refine(data => {
  // At least one field must be present
  return !!(data.title || data.category || data.department || data.sensitivity);
}, {
  message: "At least one metadata field (title, category, department, sensitivity) must be provided."
});

export const listDocumentsSchema = z.object({
  department: z.string().optional(),
  sensitivity: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'EXECUTIVE']).optional(),
});

export const documentIdSchema = z.object({
  id: z.string().min(1, 'Document ID is required')
});

export const uploadDocumentSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
});
