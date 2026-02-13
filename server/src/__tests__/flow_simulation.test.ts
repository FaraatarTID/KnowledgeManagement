import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Mock the container
vi.mock('../container.js', () => ({
  authService: {
    validateCredentials: vi.fn(),
    generateToken: vi.fn((user: any) => {
        return jwt.sign(user, env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
    }),
    getUserById: vi.fn()
  },
  userService: {
    initialize: vi.fn().mockResolvedValue(undefined)
  },
  vectorService: {},
  geminiService: {},
  auditService: {
    logAction: vi.fn()
  },
  ragService: {
     query: vi.fn().mockResolvedValue({ 
         answer: 'Mock Modern Answer',
         sources: [],
         ai_citations: [],
         usage: { total_tokens: 100 },
         integrity: { isVerified: true }
     })
  },
  chatService: {},
  driveService: {},
  syncService: {},
  historyService: {},
  configService: {},
  chatServiceInstance: {} 
}));

import { authService } from '../container.js';

describe('End-to-End Chat Flow Simulation', () => {
    let token = '';

    beforeEach(async () => {
        const mockUser = {
            id: 'sim-user-id',
            email: 'sim@example.com',
            role: 'EDITOR',
            name: 'Sim User',
            department: 'General',
            status: 'Active'
        };
        vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser as any);
        vi.mocked(authService.getUserById).mockResolvedValue(mockUser as any);
        
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'sim@example.com', password: 'password' });
        
        const cookies = res.header['set-cookie'];
        if (cookies && Array.isArray(cookies) && cookies[0]) {
            token = cookies[0].split(';')[0].split('=')[1];
        }
    });

    it('Scenario 1: Modern RAG query', async () => {
        const res = await request(app)
            .post('/api/v1/query')
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'What is the policy on MFA?'
            });

        expect(res.status).toBe(200);
        expect(res.body.answer).toBeDefined();
    });

    it('Scenario 2: Legacy endpoint remains removed', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({
                query: 'Tell me everything',
                documents: [{ id: '1', content: 'text' }]
            });

        expect(res.status).toBe(404);
    });
});
