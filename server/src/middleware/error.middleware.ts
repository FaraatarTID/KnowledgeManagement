import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

import { Logger } from '../utils/logger.js';

export const errorHandler = (err: Error | AppError, req: Request, res: Response, next: NextFunction) => {
  let error = { ...err };
  error.message = err.message;

  // Extract request ID from context middleware
  const requestId = (req as any).id || (req.headers['x-request-id'] as string) || 'unknown';
  const userId = (req as any).user?.id || 'anonymous';

  // Handle known operational errors
  if (err instanceof AppError) {
    Logger.warn('Operational error', {
      requestId,
      statusCode: err.statusCode,
      message: err.message,
      userId,
      url: req.url,
      method: req.method
    });

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      errorCode: err.name,
      requestId // Include for client support reference
    });
  }

  // Log unknown errors with full context for debugging
  Logger.error('Unhandled error occurred', {
    requestId,
    message: err.message,
    errorType: err.constructor.name,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type']
    }
  });

  // SECURITY: Don't leak stack traces in production
  if (process.env.NODE_ENV === 'production') {
    // User-friendly messages based on error type
    let userMessage = 'An unexpected error occurred. Please try again.';
    
    if (err.message.includes('database') || err.message.includes('supabase')) {
      userMessage = 'Database connection issue. Please try again in a moment.';
    } else if (err.message.includes('network') || err.message.includes('timeout')) {
      userMessage = 'Network timeout. Please check your connection and try again.';
    } else if (err.message.includes('validation') || err.message.includes('invalid')) {
      userMessage = 'Invalid input. Please check your data and try again.';
    }

    // Return support ID and request ID for customer support
    const supportId = `SUP-${requestId}-${Date.now()}`;
    
    return res.status(500).json({
      status: 'error',
      message: userMessage,
      errorCode: 'INTERNAL_ERROR',
      requestId, // User can reference this ID in logs
      supportId  // Support team can use this to find the error
    });
  }

  // Detailed error info in development (with request ID for linking)
  return res.status(500).json({
    status: 'error',
    message: err.message,
    errorCode: err.name || 'UNKNOWN_ERROR',
    requestId, // Include for development debugging
    stack: err.stack,
    details: {
      url: req.url,
      method: req.method,
      userId,
      ip: req.ip,
      timestamp: new Date().toISOString()
    }
  });
};
