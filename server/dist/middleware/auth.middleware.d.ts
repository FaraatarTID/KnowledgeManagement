import type { Request, Response, NextFunction } from 'express';
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
export declare const authMiddleware: (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const requireRole: (...allowedRoles: AuthUser["role"][]) => (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.middleware.d.ts.map