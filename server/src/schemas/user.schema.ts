import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']).optional(),
  department: z.string().optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']).optional(),
  status: z.enum(['Active', 'Inactive']).optional(),
  department: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  password: z.string().min(8),
});

export const userIdSchema = z.object({
  id: z.string().uuid(),
});
