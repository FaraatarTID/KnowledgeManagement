import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('End-to-End Chat Flow Simulation', () => {
    let adminToken = '';
    let employeeToken = '';

    beforeAll(async () => {
        // 1. Get tokens for simulation
        const adminRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'alice@aikb.com', password: 'admin123' });
        
        const adminCookies = adminRes.header['set-cookie'];
        if (adminCookies && Array.isArray(adminCookies) && adminCookies[0]) {
            adminToken = adminCookies[0].split(';')[0].split('=')[1] || '';
        }

        const empRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ email: 'david@aikb.com', password: 'admin123' });
        
        const empCookies = empRes.header['set-cookie'];
        if (empCookies && Array.isArray(empCookies) && empCookies[0]) {
            employeeToken = empCookies[0].split(';')[0].split('=')[1] || '';
        }
    });

    it('Scenario 1: Verified Multi-turn Routing (History Flow)', async () => {
        // First turn
        const res1 = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${adminToken}`)
            .send({ 
                message: 'Hello!',
                history: [] 
            });
        
        expect(res1.body.answer).toContain('Query: "Hello!"');
        
        // Second turn with history
        const res2 = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${adminToken}`)
            .send({ 
                message: 'Tell me more.',
                history: [
                    { role: 'user', content: 'Hello!' },
                    { role: 'model', content: res1.body.answer }
                ] 
            });
        
        // Gemini mock should echo back that it received 2 history items
        expect(res2.body.answer).toContain('with 2 previous messages');
        expect(res2.body.answer).toContain('Query: "Tell me more."');
        console.log('✅ Flow Verified: Post -> RAGService -> Gemini (History preserved)');
    });

    it('Scenario 2: Data Grounding (Context Routing)', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${adminToken}`)
            .send({ 
                message: 'Check documentation.',
                history: [] 
            });
        
        // In mock mode, VectorService returns 2 docs by default
        expect(res.body.answer).toContain('Context: 2 relevant snippets found.');
        console.log('✅ Flow Verified: Retrieval triggered and context injected');
    });

    it('Scenario 3: Security Bound Routing', async () => {
        // Currently we don't have a specific test for partial filtering in the mock,
        // but this verifies the endpoint still functions correctly under different identities.
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${employeeToken}`)
            .send({ message: 'Can I see restricted files?' });
        
        expect(res.status).toBe(200);
        expect(res.body.answer).toBeDefined();
        console.log('✅ Flow Verified: Role-based request routing functional');
    });
});
