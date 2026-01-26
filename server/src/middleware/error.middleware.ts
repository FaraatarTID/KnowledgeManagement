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

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      errorCode: err.name
    });
  }

  // Log unknown errors with context
  Logger.error('Unhandled Error 💥', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
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

    return res.status(500).json({
      status: 'error',
      message: userMessage,
      errorCode: 'INTERNAL_ERROR',
      supportId: `ERR-${Date.now()}` // For tracking support tickets
    });
  }

  // Detailed error info in development
  return res.status(500).json({
    status: 'error',
    message: err.message,
    errorCode: err.name || 'UNKNOWN_ERROR',
    stack: err.stack,
    details: {
      url: req.url,
      method: req.method,
      ip: req.ip,
      timestamp: new Date().toISOString()
    }
  });
};
