import { z } from 'zod';

/**
 * Zod Schemas for Authentication
 */

export const loginSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  password: z.string().min(1, 'Password is required').optional(),
  type: z.enum(['admin', 'user']).optional()
}).refine((data) => {
  // Demo Mode: Requires 'type' but no 'email'
  if (data.type && !data.email) return true;
  
  // Standard Mode: Requires 'email' and 'password'
  return !!(data.email && data.password);
}, {
  message: "Provide valid email/password OR demo user type",
  path: ['email'] // Error pointer
});
