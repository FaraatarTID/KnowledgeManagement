import rateLimit from 'express-rate-limit';

// Global API rate limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // Limit each IP to 300 requests per 15 mins
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again later.' }
});

// Stricter limiter for sensitive auth routes (login)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // SECURITY: Limit each IP to 10 login attempts per 15 mins (was 100)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 15 minutes.' }
});

// Limiter for resource-intensive operations (like Sync or RAG query)
export const resourceLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit 20 queries/syncs per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are making too many complex requests, please slow down.' }
});
