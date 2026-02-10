import { z } from 'zod';

/**
 * Zod Schemas for Authentication
 */

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
}).refine((data) => {
  return !!(data.email && data.password);
}, {
  message: "Provide valid email/password",
  path: ['email'] // Error pointer
});
