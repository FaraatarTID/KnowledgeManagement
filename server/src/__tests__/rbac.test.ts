import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('RBAC (Role Based Access Control)', () => {
    let viewerToken = '';
    let adminToken = '';

    beforeAll(async () => {
        // 1. Login as Viewer (David)
        const resViewer = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'david@aikb.com', password: 'admin123' });
        
        const cookiesV = resViewer.header['set-cookie'];
        if (cookiesV && Array.isArray(cookiesV) && cookiesV[0]) {
            viewerToken = cookiesV[0].split(';')[0].split('=')[1] || '';
        } else {
             throw new Error('Viewer login failed');
        }

        // 2. Login as Admin (Alice)
        const resAdmin = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'alice@aikb.com', password: 'admin123' });
            
        const cookiesA = resAdmin.header['set-cookie'];
        if (cookiesA && Array.isArray(cookiesA) && cookiesA[0]) {
            adminToken = cookiesA[0].split(';')[0].split('=')[1] || '';
        } else {
            throw new Error('Admin login failed');
        }
    });

    it('Admin SHOULD be able to access restricted route (Upload)', async () => {
        // Upload requires ADMIN or MANAGER
        // We just check if it passes the Role Check (might fail on file missing 400, but NOT 403)
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', `token=${adminToken}`)
            .attach('file', Buffer.from('test'), 'test.txt');
        
        // 200 (Success) or 500 (Processing error) or 400. 
        // Crucially: NOT 403.
        expect(res.status).not.toBe(403);
    });

    it('Viewer should be FORBIDDEN from Uploading', async () => {
        const res = await request(app)
            .post('/api/v1/upload')
            .set('Cookie', `token=${viewerToken}`)
            .attach('file', Buffer.from('hack'), 'hack.txt');
        
        expect(res.status).toBe(403);
    });

    it('Viewer should be FORBIDDEN from Listing Users', async () => {
        // Assuming /users is admin only
        const res = await request(app)
            .get('/api/v1/users')
            .set('Cookie', `token=${viewerToken}`);
            
        expect(res.status).toBe(403);
    });
});
