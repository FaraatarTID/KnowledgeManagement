import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';
  department: string;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
  file?: Express.Multer.File | undefined;
}

import { env } from '../config/env.js';

let _authService: any = null;
const getAuthService = async () => {
  if (!_authService) {
    const { authService } = await import('../container.js');
    _authService = authService;
  }
  return _authService;
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = (req as any)?.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const secret = env.JWT_SECRET;
  
  try {
    const decoded = jwt.verify(token, secret) as AuthUser;
    
    // SECURITY: Validate token timing claims to prevent clock skew attacks
    const payload = jwt.decode(token) as any;
    const iat = (payload?.iat || 0) * 1000;
    const now = Date.now();
    
    if (iat > now) {
      return res.status(401).json({ error: 'Token issued in future (clock skew)' });
    }
    if (now - iat > 24 * 60 * 60 * 1000) {
      // Token is older than 24h (shouldn't happen with valid JWT, but defense in depth)
      return res.status(401).json({ error: 'Token age exceeds validity window' });
    }
    
    // SECURITY: Real-time User State Check
    // If Supabase is configured, verify the user still exists and is Active
    const authService = await getAuthService();
    const user = await authService.getUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists' });
    }
    
    if (user.status === 'Inactive') {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // SECURITY: CRITICAL - Verify role hasn't been escalated/changed
    // If JWT role doesn't match DB role, attacker may have forged token
    if (user.role !== decoded.role) {
      Logger.warn('SECURITY: Role mismatch detected - possible privilege escalation attempt', {
        userId: decoded.id,
        email: decoded.email,
        tokenRole: decoded.role,
        dbRole: user.role,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      return res.status(401).json({ 
        error: 'Your permissions have changed. Please log in again.',
        code: 'ROLE_CHANGED'
      });
    }

    // Pass latest user data from DB instead of stale JWT data
    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    Logger.warn('JWT verification failed', { error: error.message, ip: req.ip });
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Role-based access control middleware factory
export const requireRole = (...allowedRoles: AuthUser['role'][]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `Access denied. Required role: ${allowedRoles.join(' or ')}` 
      });
    }
    
    next();
  };
};
