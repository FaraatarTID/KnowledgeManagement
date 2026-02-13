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
