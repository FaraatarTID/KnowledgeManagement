import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps async route handlers to catch errors and pass them to the global error handler.
 * Returns a standard RequestHandler to ensure perfect Express compatibility and 
 * avoid deep type inference recursion issues.
 */
export const catchAsync = (fn: (req: any, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
  return (req, res, next) => fn(req, res, next).catch(next);
};
