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
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // SECURITY: Only accept tokens from httpOnly cookies to prevent XSS token theft
  // Removed Authorization header fallback to enforce browser security features
  const token = (req as any)?.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // SECURITY: Fail fast if JWT_SECRET is not configured
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    // SECURITY: Log invalid token attempts for security monitoring
    console.warn(`Invalid token attempt from IP: ${req.ip}`);
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
