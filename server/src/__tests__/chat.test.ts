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
  chatService: {
    queryChatLegacy: vi.fn().mockResolvedValue('Mock Legacy Answer')
  },
  driveService: {},
  syncService: {},
  historyService: {},
  configService: {},
  chatServiceInstance: {} 
}));

import { authService } from '../container.js';

describe('Chat API', () => {
    let token = '';

    beforeEach(async () => {
        const mockUser = {
            id: 'user-id',
            email: 'user@example.com',
            role: 'VIEWER',
            name: 'Test Viewer',
            department: 'General',
            status: 'Active'
        };
        vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser as any);
        vi.mocked(authService.getUserById).mockResolvedValue(mockUser as any);
        
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'user@example.com', password: 'password' });
        
        const cookies = res.header['set-cookie'];
        if (cookies && Array.isArray(cookies) && cookies[0]) {
            token = cookies[0].split(';')[0].split('=')[1];
        }
    });

    it('Modern RAG: should respond to /query', async () => {
        const res = await request(app)
            .post('/api/v1/query') // FIXED PATH
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'What is this about?'
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('answer', 'Mock Modern Answer');
    });

    it('Legacy Chat: should respond to /chat', async () => {
        const testDocuments = [{ id: "1", content: "text" }];
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'Legacy query', 
                documents: testDocuments
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('answer', 'Mock Legacy Answer');
        expect(res.body).toHaveProperty('content', 'Mock Legacy Answer');
        expect(res.body).toHaveProperty('sources');
        expect(res.body).toHaveProperty('integrity');
    });

    it('should reject empty modern query', async () => {
        const res = await request(app)
            .post('/api/v1/query') // FIXED PATH
            .set('Cookie', `token=${token}`)
            .send({ 
                query: '' 
            });
        
        expect(res.status).toBe(400);
    });
});
