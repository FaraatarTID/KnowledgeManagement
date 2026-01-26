import type { Request, Response, NextFunction } from 'express';
import { AsyncContext } from '../utils/context.js';
import { Logger } from '../utils/logger.js';
import crypto from 'crypto';

/**
 * Middleware to initialize the AsyncContext and generating a Request ID.
 * Must be the FIRST middleware in the chain.
 */
export const contextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  AsyncContext.run(() => {
    const requestId = req.headers['x-request-id'] as string || `req-${crypto.randomUUID().slice(0,8)}`;
    AsyncContext.setRequestId(requestId);
    
    // Attach to response header for client-side tracing
    res.setHeader('x-request-id', requestId);

    // Log the request
    Logger.info(`${req.method} ${req.url}`, {
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Capture response time
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const meta = {
        method: req.method,
        url: req.url,
        duration: `${duration}ms`,
        statusCode: res.statusCode
      };

      if (res.statusCode >= 400) {
        Logger.warn(`Response ${res.statusCode}`, meta);
      } else {
        Logger.info(`Response ${res.statusCode}`, meta);
      }
    });

    next();
  });
};
