import { z } from 'zod';

const passwordSchema = z.string()
  .min(10, 'Password must be at least 10 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-0]/, 'Password must contain at least one special character');

export const createUserSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: passwordSchema,
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']).optional(),
  department: z.string().trim().min(2).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  department: z.string().trim().min(2).optional(),
});

export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

export const userIdSchema = z.object({
  id: z.string().uuid(),
});
