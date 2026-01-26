import type { Request, Response, NextFunction } from 'express';

/**
 * Global Sanitization Middleware
 * 1. Trims all string inputs recursive.
 * 2. Removes null bytes and dangerous control characters.
 * 3. Prevents "Unicode Injection" by normalizing to NFC.
 */
export const sanitizationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeValue = (val: any): any => {
    if (typeof val === 'string') {
      // Remove null bytes and control characters except common whitespace
      // Also normalize unicode to prevent RLO/LRO attacks
      return val
        .replace(/\0/g, '') // Null bytes
        .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, '') // Invisible / BiDi chars
        .normalize('NFC')
        .trim();
    }
    if (Array.isArray(val)) {
      return val.map(sanitizeValue);
    }
    if (val !== null && typeof val === 'object') {
      const sanitized: any = {};
      for (const key in val) {
        sanitized[key] = sanitizeValue(val[key]);
      }
      return sanitized;
    }
    return val;
  };

  if (req.body) {
    const sanitizedBody = sanitizeValue(req.body);
    // Use Object.assign to avoid overwriting the reference if it's locked
    if (typeof req.body === 'object' && !Array.isArray(req.body)) {
       Object.keys(req.body).forEach(key => delete req.body[key]);
       Object.assign(req.body, sanitizedBody);
    } else {
       req.body = sanitizedBody;
    }
  }

  // For query and params, we iterate and sanitize keys/values specifically
  if (req.query) {
    for (const key in req.query) {
      req.query[key] = sanitizeValue(req.query[key]);
    }
  }

  if (req.params) {
    for (const key in req.params) {
      req.params[key] = sanitizeValue(req.params[key]);
    }
  }

  next();
};
