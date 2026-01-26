import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatController } from '../../../controllers/chat.controller.js';
import { ragService, chatService } from '../../../container.js';
import { Request, Response } from 'express';

vi.mock('../../../container.js', () => ({
  ragService: {
    query: vi.fn()
  },
  chatService: {
    queryChatLegacy: vi.fn()
  }
}));

describe('ChatController', () => {
    let mockRequest: any;
    let mockResponse: any;
    let jsonMock: any;
    let statusMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });

        mockRequest = {};
        mockResponse = {
            status: statusMock,
            json: jsonMock
        };
        
        vi.clearAllMocks();
    });

    describe('query (Modern RAG)', () => {
        it('should return 400 for invalid query', async () => {
             mockRequest.body = { query: '' }; // Empty
             mockRequest.user = { id: '1', role: 'VIEWER' };

             await ChatController.query(mockRequest, mockResponse);
             
             expect(statusMock).toHaveBeenCalledWith(400);
             expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'Invalid query' }));
        });

        it('should return RAG result', async () => {
             const mockResult = { answer: 'Paris', sources: [] };
             mockRequest.body = { query: 'Capital of France?' };
             mockRequest.user = { id: '1', name: 'User', role: 'VIEWER', department: 'IT' };
             
             vi.mocked(ragService.query).mockResolvedValue(mockResult);

             await ChatController.query(mockRequest, mockResponse);
             
             expect(ragService.query).toHaveBeenCalledWith(expect.objectContaining({
                 query: 'Capital of France?',
                 userId: '1',
                 userProfile: expect.objectContaining({ department: 'IT' })
             }));
             expect(jsonMock).toHaveBeenCalledWith(mockResult);
        });

        it('should handle service errors gracefully', async () => {
             mockRequest.body = { query: 'Error?' };
             mockRequest.user = { id: '1' };
             vi.mocked(ragService.query).mockRejectedValue(new Error('AI Down'));

             await ChatController.query(mockRequest, mockResponse);
             
             expect(statusMock).toHaveBeenCalledWith(500);
             expect(jsonMock).toHaveBeenCalledWith({ error: 'Failed to process query' });
        });
    });

    describe('legacyChat', () => {
        it('should return 400 if documents missing', async () => {
            mockRequest.body = { query: 'Hi' };
            await ChatController.legacyChat(mockRequest, mockResponse);
            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it('should pass data to legacy service', async () => {
            mockRequest.body = { query: 'Hi', documents: [{id:'1', content:'A'}] };
            vi.mocked(chatService.queryChatLegacy).mockResolvedValue('Response');

            await ChatController.legacyChat(mockRequest, mockResponse);

            expect(chatService.queryChatLegacy).toHaveBeenCalledWith('Hi', [{id:'1', content:'A'}]);
            expect(jsonMock).toHaveBeenCalledWith({ content: 'Response' });
        });
    });
});
