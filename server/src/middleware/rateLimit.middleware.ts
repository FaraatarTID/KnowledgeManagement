import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const getIpKey = (req: Request) => ipKeyGenerator(req as any);

export const buildGlobalLimiterKey = (req: Request) => {
  const userId = (req as any).user?.id;
  return userId ? `user:${userId}` : `ip:${getIpKey(req)}`;
};

export const buildAuthLimiterKey = (req: Request) => {
  const email = ((req.body as any)?.email || '').toLowerCase().trim();
  if (!email) {
    return `ip:${getIpKey(req)}`;
  }
  return `auth:${email}`;
};

export const buildResourceLimiterKey = (req: Request) => {
  const userId = (req as any).user?.id;
  return userId ? `resource:${userId}` : `resource:${getIpKey(req)}`;
};

// Global API rate limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 mins
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' },
  keyGenerator: buildGlobalLimiterKey
});

// Stricter limiter for sensitive auth routes (login)
// CRITICAL: Use email from request body + IP to prevent bypass
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // SECURITY: Limit to 10 login attempts per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 15 minutes.' },
  keyGenerator: buildAuthLimiterKey,
  skip: (req: Request) => {
    // Don't rate limit localhost in development
    return req.ip === '127.0.0.1' && process.env.NODE_ENV === 'development';
  }
});

// Limiter for resource-intensive operations (like Sync or RAG query)
export const resourceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit 20 queries/syncs per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are making too many complex requests, please slow down.' },
  keyGenerator: buildResourceLimiterKey
});
