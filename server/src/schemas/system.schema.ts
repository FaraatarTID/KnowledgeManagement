import { z } from 'zod';

export const updateCategoriesSchema = z.object({
  categories: z.array(z.string()).min(1),
});

export const updateDepartmentsSchema = z.object({
  departments: z.array(z.string()).min(1),
});
