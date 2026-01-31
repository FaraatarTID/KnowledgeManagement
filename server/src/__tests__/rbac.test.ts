import { describe, it, expect, vi } from 'vitest';
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
    getAll: vi.fn(),
    getById: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined)
  },
  vectorService: {
    getVectorCount: vi.fn().mockResolvedValue(0),
    upsert: vi.fn()
  },
  geminiService: {},
  auditService: {
    logAction: vi.fn()
  },
  ragService: {},
  driveService: {},
  syncService: {},
  historyService: {},
  configService: {},
  chatService: {}
}));

import { authService } from '../container.js';

async function getAuthCookie(role: string) {
    const mockUser = {
        id: `${role}-id`,
        email: `${role}@aikb.com`,
        role: role,
        name: `${role} User`,
        department: 'General',
        status: 'Active'
    };
    
    vi.mocked(authService.validateCredentials).mockResolvedValue(mockUser as any);
    vi.mocked(authService.getUserById).mockResolvedValue(mockUser as any);
    
    const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${role}@aikb.com`, password: 'password' });
    
    return res.header['set-cookie'] ? res.header['set-cookie'][0].split(';')[0] : '';
}

describe('RBAC (Role Based Access Control)', () => {
    it('Admin SHOULD be able to access restricted route (Upload)', async () => {
        const adminCookie = await getAuthCookie('ADMIN');
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', adminCookie)
            .attach('file', Buffer.from('test'), 'test.txt');
        
        expect(res.status).not.toBe(403);
        expect(res.status).not.toBe(401);
    });

    it('Viewer should be FORBIDDEN from Uploading', async () => {
        const viewerCookie = await getAuthCookie('VIEWER');
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', viewerCookie)
            .attach('file', Buffer.from('hack'), 'hack.txt');
        
        expect(res.status).toBe(403);
    });

    it('Viewer should be FORBIDDEN from Listing Users', async () => {
        const viewerCookie = await getAuthCookie('VIEWER');
        const res = await request(app)
            .get('/api/v1/users')
            .set('Cookie', viewerCookie);
            
        expect(res.status).toBe(403);
    });
});
