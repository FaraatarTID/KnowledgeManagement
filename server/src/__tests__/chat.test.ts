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
        if (cookies && cookies[0]) {
            token = cookies[0].split(';')[0].split('=')[1];
        } else {
             // Fallback for demo mode if cookies fail logic (shouldn't happen with fix)
             token = res.body.token;
        }
    });

    it('should respond to a chat message', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                message: 'Hello, who are you?', 
                history: [] 
            });

        // If Mock Mode is active, it might answer "I am AIKB..."
        // Or fail if Vertex AI key missing and not mocked?
        // Logs said GeminiService initialized in MOCK MODE (Step 441).
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('answer');
        expect(typeof res.body.answer).toBe('string');
    });

    it('should maintain conversation history', async () => {
        // Not strictly testing DB, just API accepting history param
        const res = await request(app)
            .post('/api/v1/chat')
            .set('Cookie', `token=${token}`)
            .send({ 
                message: 'What did I just ask?',
                history: [{ role: 'user', content: 'Hello' }, { role: 'model', content: 'Hi' }]
            });
        
        expect(res.status).toBe(200);
    });

    it('should reject unauthenticated chat', async () => {
        const res = await request(app)
            .post('/api/v1/chat')
            .send({ message: 'Hack attempt' });
        
        expect(res.status).toBe(401);
    });
});
