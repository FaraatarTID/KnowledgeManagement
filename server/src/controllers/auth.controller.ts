import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  type: z.enum(['admin', 'user']).optional()
});

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const parsed = loginSchema.safeParse(req.body);
      
      // Legacy demo mode support
      if (req.body.type && !req.body.email) {
        const demoEmail = req.body.type === 'admin' ? 'alice@aikb.com' : 'david@aikb.com';
        const demoPassword = 'admin123';
        
        const user = await authService.validateCredentials(demoEmail, demoPassword);
        if (!user) return res.status(401).json({ error: 'Demo credentials failed' });
        
        const token = authService.generateToken(user);
        res.cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000
        });
        return res.json({ token, user });
      }
      
      if (!parsed.success) {
        return res.status(400).json({ 
          error: 'Invalid credentials format',
          details: parsed.error.issues.map(i => i.message)
        });
      }
      
      const { email, password } = parsed.data;
      const user = await authService.validateCredentials(email, password);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });
      
      const token = authService.generateToken(user);
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      
      res.json({ token, user });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }

  static async logout(req: Request, res: Response) {
    res.clearCookie('token');
    res.json({ success: true });
  }

  static async me(req: AuthRequest, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    
    const user = await authService.getUserById(req.user?.id || '');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  }
}
