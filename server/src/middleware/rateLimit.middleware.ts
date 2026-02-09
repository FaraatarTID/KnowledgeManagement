import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const getIpKey = (req: Request) => ipKeyGenerator(req);

// Global API rate limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 mins
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' },
  keyGenerator: (req: Request) => {
    // Use user ID if authenticated, otherwise use IP
    // Behind reverse proxy, IP may be same for all requests
    const userId = (req as any).user?.id;
    return userId ? `user:${userId}` : `ip:${getIpKey(req)}`;
  }
});

// Stricter limiter for sensitive auth routes (login)
// CRITICAL: Use email from request body + IP to prevent bypass
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // SECURITY: Limit to 10 login attempts per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 15 minutes.' },
  keyGenerator: (req: Request) => {
    // Rate limit by email address (from body) to prevent account enumeration
    // Even if multiple IPs used (compromised account), email is limited
    const email = (req.body?.email || '').toLowerCase().trim();
    if (!email) {
      return `ip:${getIpKey(req)}`; // Fallback if no email
    }
    return `auth:${email}`;
  },
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
  keyGenerator: (req: Request) => {
    // Rate limit per authenticated user
    // Prevents single user from overwhelming the system
    const userId = (req as any).user?.id;
    return userId ? `resource:${userId}` : `resource:${getIpKey(req)}`;
  }
});
