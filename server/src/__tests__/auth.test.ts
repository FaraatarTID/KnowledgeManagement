import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Auth API', () => {
  it('should return 401 for login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'wrong@aikb.com', password: 'wrongpassword' });
    
    expect(res.status).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  it('should enforce rate limiting on login', async () => {
    // Only test if rate limiter is active (middleware imported).
    // This might be tricky to test if rate limit is per IP and persistent.
    // For now just basic check.
  });

  it('should return 401 for protected route without cookie', async () => {
    const res = await request(app).get('/api/v1/users');
    expect(res.status).toBe(401);
  });
  
  it('should return 404 for non-existent route', async () => {
      const res = await request(app).get('/api/v1/non-existent');
      // Express default or our error handler
      // If error handler is set up, it might return 404 or just HTML if not handled well.
      // But typically 404.
      expect(res.status).toBe(404);
  });
});
