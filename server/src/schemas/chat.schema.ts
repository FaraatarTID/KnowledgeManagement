import { z } from 'zod';

/**
 * Zod Schemas for Chat & Query Validation
 * Enforces limits on query length and document array structure.
 */

export const querySchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query too long (max 2000 chars)')
});

const legacyDocumentSchema = z.object({
  id: z.string(),
  content: z.string(),
});

export const legacyChatSchema = z.object({
  query: z.string().min(1).max(2000),
  documents: z.array(legacyDocumentSchema)
    .min(1, 'Documents array is required')
    .max(100, 'Too many documents (max 100)'), // Enforces the explicit 100 limit
});
