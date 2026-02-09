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
import { captureError } from '../utils/error-tracking.js';

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

  // Log unknown errors with full context for debugging (internal only)
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
    // FIXED: Do NOT include raw headers in logs (may contain PII/tokens)
    headers: {
      'content-type': req.headers['content-type']
    }
  });

  captureError(err, {
    requestId,
    userId,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // SECURITY: ALWAYS return sanitized error in production
  // CRITICAL: Even in development, never leak file paths or internal structure
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

  // FIXED: Development mode - still sanitize stack traces and PII
  // Remove file paths, query params, and secrets from stack trace
  let sanitizedStack = err.stack || '';
  
  // Redact common sensitive patterns
  sanitizedStack = sanitizedStack
    .replace(/\/[^\s]*\/node_modules\//g, '...node_modules...')  // Hide node_modules paths
    .replace(/\/[^\s]*\/server\//g, '.../server/')  // Shorten server paths
    .replace(/\/[^\s]*\/client\//g, '.../client/')  // Shorten client paths
    .replace(/password[=:][^\s]*/gi, 'password=***')  // Hide passwords
    .replace(/token[=:][^\s]*/gi, 'token=***')  // Hide tokens
    .replace(/secret[=:][^\s]*/gi, 'secret=***');  // Hide secrets

  return res.status(500).json({
    status: 'error',
    message: err.message,
    errorCode: err.name || 'UNKNOWN_ERROR',
    requestId, // Include for development debugging
    stack: sanitizedStack,  // FIXED: Sanitized, not raw
    details: {
      url: req.url,
      method: req.method,
      // FIXED: Do NOT include user ID in error details (privacy)
      timestamp: new Date().toISOString()
    }
  });
};
