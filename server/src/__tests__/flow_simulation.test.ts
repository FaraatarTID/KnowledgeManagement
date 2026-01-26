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

    it('Scenario 1: Basic Chat with Documents', async () => {
        const testDocuments = [
            {
                id: "doc-1",
                title: "Company Policy",
                content: "The company policy requires all employees to wear badges.",
                category: "HR",
                createdAt: new Date().toISOString()
            }
        ];

        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${adminToken}`)
            .send({ 
                query: 'What is the company policy?',
                documents: testDocuments
            });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('content');
        expect(typeof res.body.content).toBe('string');
    });

    it('Scenario 2: Reject Empty Documents', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${employeeToken}`)
            .send({ 
                query: 'What is the capital of France?',
                documents: []
            });
        
        expect(res.status).toBe(400);
        // expect(res.body.content).toContain('اطلاعاتی برای پاسخ'); // No content on 400
    });

    it('Scenario 3: Invalid Request Body', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${adminToken}`)
            .send({ 
                query: 'What is the company policy?' 
                // Missing documents
            });
        
        expect(res.status).toBe(400);
    });
});
