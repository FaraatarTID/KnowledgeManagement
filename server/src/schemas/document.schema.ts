import { z } from 'zod';

/**
 * Zod schemas for Document Routes.
 * Enforces strict typing and validation logic before the controller is even prioritized.
 */

const roleTokenSchema = z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']);
const parseRoleInput = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
        }
      } catch {
        // Fall back to comma-delimited parsing.
      }
    }

    return trimmed.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean);
  }

  return value;
};

const documentRolesSchema = z.preprocess(
  parseRoleInput,
  z.array(roleTokenSchema).min(1)
).optional();

export const updateDocumentSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').optional(),
  category: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  sensitivity: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED', 'EXECUTIVE']).optional(),
  roles: documentRolesSchema
}).refine(data => {
  // At least one field must be present
  return !!(data.title || data.category || data.department || data.sensitivity || data.roles);
}, {
  message: "At least one metadata field (title, category, department, sensitivity, roles) must be provided."
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
  roles: documentRolesSchema
});
