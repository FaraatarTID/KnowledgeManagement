import type { Request, Response, RequestHandler } from 'express';
// Removed inline z import
import { authService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { catchAsync } from '../utils/catchAsync.js';

export class AuthController {
  
  static login: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    // Validation handled by middleware logic, but we need to check the shapes
    // Since we use a union-like refinement, types are optional in the inferred type
    const { email, password } = req.body;
    
    // Standard Login
    if (!email || !password) {
       // Should be caught by Zod, but double check for type safety
       throw new AppError('Invalid credentials', 400);
    }

    const user = await authService.validateCredentials(email, password);
    if (!user) throw new AppError('Invalid email or password', 401);
    
    const token = authService.generateToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    Logger.info('User login successful', { user: user.email });
    res.json({ token, user });
  });

  static logout: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    res.clearCookie('token');
    Logger.info('User logout');
    res.json({ success: true });
  });

  static me: RequestHandler = catchAsync(async (req: Request, res: Response) => {
    const authReq = req as AuthRequest;
    if (!authReq.user) throw new AppError('Not authenticated', 401);
    
    const user = await authService.getUserById(authReq.user.id);
    if (!user) throw new AppError('User not found', 404);
    
    res.json(user);
  });
}
