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
    getAll: vi.fn().mockResolvedValue([]),
    getById: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined)
  },
  vectorService: {
    getVectorCount: vi.fn().mockResolvedValue(0),
    upsert: vi.fn().mockResolvedValue({ id: '123' }),
    updateDocumentMetadata: vi.fn().mockResolvedValue(undefined),
    getAllMetadata: vi.fn().mockResolvedValue({}),
    deleteDocument: vi.fn().mockResolvedValue(undefined)
  },
  geminiService: {
    queryKnowledgeBase: vi.fn().mockResolvedValue({ text: '{}' })
  },
  auditService: {
    logAction: vi.fn()
  },
  ragService: {
    query: vi.fn().mockResolvedValue({ 
        answer: 'Mocked answer',
        sources: [],
        ai_citations: [],
        usage: { total_tokens: 10 },
        integrity: { isVerified: true }
    })
  },
  driveService: {
      uploadFile: vi.fn().mockResolvedValue('drive-id-123'),
      listFiles: vi.fn().mockResolvedValue([]),
      getFileMetadata: vi.fn().mockResolvedValue({ id: '123', name: 'test.pdf' })
  },
  syncService: {
      indexFile: vi.fn().mockResolvedValue(undefined),
      syncAll: vi.fn().mockResolvedValue({ processed: 0, added: 0, updated: 0, errors: [] })
  },
  historyService: {
      recordEvent: vi.fn().mockResolvedValue(undefined)
  },
  configService: {},
  chatService: {}
}));

import { authService } from '../container.js';

describe('Upload API Security', () => {
    let token = '';

    beforeEach(async () => {
        const mockUser = {
            id: 'admin-id',
            email: 'admin@aikb.com',
            role: 'ADMIN',
            name: 'Admin User',
            department: 'IT',
            status: 'Active'
        };
        vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser as any);
        vi.mocked(authService.getUserById).mockResolvedValue(mockUser as any);
        
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'admin@aikb.com', password: 'password' });
        
        const cookies = res.header['set-cookie'];
        if (cookies && Array.isArray(cookies) && cookies[0]) {
            token = cookies[0].split(';')[0].split('=')[1];
        }
    });

    it('should reject .exe files', async () => {
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', `token=${token}`)
            .attach('file', Buffer.from('fake exe content'), 'malware.exe');
        
        expect(res.status).not.toBe(200);
    });

    it('should accept valid PDF (if authenticated)', async () => {
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', `token=${token}`)
            .attach('file', Buffer.from('%PDF-1.4...'), 'test.pdf');
        
        expect(res.status).toBe(200);
        expect(res.body.file.mimetype).toBe('application/pdf');
    });
});
