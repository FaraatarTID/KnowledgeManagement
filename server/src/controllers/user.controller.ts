import type { Request, Response, RequestHandler } from 'express';
import { userService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { catchAsync } from '../utils/catchAsync.js';

export class UserController {
  
  static list: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const users = await userService.getAll();
    res.json(users);
  });

  static create: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { email, password, name, role, department } = req.body;
    
    const existing = await userService.getByEmail(email);
    if (existing) throw new AppError('User with this email already exists', 400);

    const newUser = await userService.create({
      email,
      password,
      name,
      role: role || 'VIEWER',
      department: department || 'General'
    });

    if (!newUser) throw new AppError('Failed to create user', 500);

    Logger.info('User created', { email, role: newUser.role });
    res.status(201).json(newUser);
  });

  static update: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { role, status, department } = req.body;
    
    if (!id) throw new AppError('User ID is required', 400);
    const updatedUser = await userService.update(id, { role, status, department });
    if (!updatedUser) throw new AppError('User not found', 404);
    
    Logger.info('User updated', { userId: id, changes: { role, status, department } });
    res.json(updatedUser);
  });

  static delete: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new AppError('User ID is required', 400);
    const success = await userService.delete(id);
    if (!success) throw new AppError('User not found or deletion failed', 404);
    
    Logger.info('User deleted', { userId: id });
    res.json({ success: true, message: 'User deleted successfully' });
  });

  static updatePassword: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { password } = req.body;
    
    if (!id) throw new AppError('User ID is required', 400);
    const success = await userService.updatePassword(id, password);
    if (!success) throw new AppError('User not found or update failed', 404);
    
    Logger.info('User password updated', { userId: id });
    res.json({ success: true, message: 'Password updated successfully' });
  });
}
