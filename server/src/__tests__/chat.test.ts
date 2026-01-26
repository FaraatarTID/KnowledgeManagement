import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Chat API (Core Loop)', () => {
    let token = '';

    beforeAll(async () => {
        // Login as 'david' (Viewer is enough for chat)
        const res = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'david@aikb.com', password: 'admin123' });
        
        const cookies = res.header['set-cookie'];
        if (cookies && Array.isArray(cookies) && cookies[0]) {
            token = cookies[0].split(';')[0].split('=')[1] || '';
        } else {
             // Fallback for demo mode if cookies fail logic (shouldn't happen with fix)
             token = res.body.token || '';
        }
    });

    it('should respond to a chat query with documents', async () => {
        const testDocuments = [
            {
                id: "test-doc-1",
                title: "Test Document",
                content: "This is a test document containing information about the project.",
                category: "General",
                createdAt: new Date().toISOString()
            }
        ];

        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'What is this document about?', 
                documents: testDocuments
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('content');
        expect(typeof res.body.content).toBe('string');
    });

    it('should reject empty documents array', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'What is this document about?', 
                documents: []
            });
        
        expect(res.status).toBe(400);
        // expect(res.body.content).toContain('اطلاعاتی برای پاسخ'); // No longer returns content on 400
    });

    it('should reject invalid request body', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                query: 'What is this document about?' 
                // Missing documents
            });
        
        expect(res.status).toBe(400);
    });
});
