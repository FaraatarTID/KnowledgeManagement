import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentController } from '../../../controllers/document.controller.js';
import { driveService, vectorService, syncService, historyService } from '../../../container.js';

vi.mock('../../../container.js', () => ({
  driveService: {
    uploadFile: vi.fn(),
    listFiles: vi.fn(),
    getFileMetadata: vi.fn(),
    checkHealth: vi.fn(),
    renameFile: vi.fn()
  },
  vectorService: {
    updateDocumentMetadata: vi.fn(),
    getAllMetadata: vi.fn(),
    deleteDocument: vi.fn()
  },
  syncService: {
    indexFile: vi.fn(),
    syncAll: vi.fn()
  },
  historyService: {
    recordEvent: vi.fn()
  }
}));

describe('DocumentController', () => {
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
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'real-folder';
    });

    describe('upload', () => {
        it('should return 400 if no file', async () => {
            await DocumentController.upload(mockRequest, mockResponse);
            expect(statusMock).toHaveBeenCalledWith(400);
        });

        it('should process upload sequence', async () => {
            mockRequest.file = { path: 'tmp/path', mimetype: 'app/pdf', originalname: 'test.pdf' };
            mockRequest.body = { category: 'IT' };
            
            vi.mocked(driveService.uploadFile).mockResolvedValue('file-id-1');

            await DocumentController.upload(mockRequest, mockResponse);

            expect(driveService.uploadFile).toHaveBeenCalled();
            expect(vectorService.updateDocumentMetadata).toHaveBeenCalledWith('file-id-1', expect.anything());
            expect(syncService.indexFile).toHaveBeenCalled();
            expect(historyService.recordEvent).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });
    });

    describe('list', () => {
        it('should list files filtering by department for viewer', async () => {
             mockRequest.user = { role: 'VIEWER', department: 'HR' };
             vi.mocked(vectorService.getAllMetadata).mockResolvedValue({});
             vi.mocked(driveService.listFiles).mockResolvedValue([
                 { id: '1', name: 'HR Doc', owners: [] } as any,
                 { id: '2', name: 'IT Doc', owners: [] } as any
             ]);
             
             // Mock vector metadata to assign departments
             vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                 '1': { department: 'HR' },
                 '2': { department: 'IT' }
             });

             await DocumentController.list(mockRequest, mockResponse);
             
             expect(jsonMock).toHaveBeenCalled();
             const result = jsonMock.mock.calls[0][0];
             expect(result).toHaveLength(1);
             expect(result[0].id).toBe('1');
        });
    });

    describe('delete', () => {
        it('should delete document', async () => {
            mockRequest.params = { id: '123' };
            await DocumentController.delete(mockRequest, mockResponse);
            expect(vectorService.deleteDocument).toHaveBeenCalledWith('123');
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });
    });

    describe('update', () => {
        it('should update metadata and record history when user is owner', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { title: 'New Title' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };
            
            // Mock getAllMetadata to return doc owned by the requesting user
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                '1': { owner: 'alice@aikb.com', category: 'IT' }
            });
            vi.mocked(driveService.renameFile).mockResolvedValue(true);
            
            await DocumentController.update(mockRequest, mockResponse);
            
            expect(vectorService.updateDocumentMetadata).toHaveBeenCalled();
            expect(driveService.renameFile).toHaveBeenCalledWith('1', 'New Title');
            expect(historyService.recordEvent).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });

        it('should reject update when user is not owner or admin', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { title: 'Hacked Title' };
            mockRequest.user = { email: 'attacker@aikb.com', role: 'VIEWER' };
            
            // Mock getAllMetadata to return doc owned by someone else
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                '1': { owner: 'alice@aikb.com', category: 'IT' }
            });
            
            await DocumentController.update(mockRequest, mockResponse);
            
            expect(statusMock).toHaveBeenCalledWith(403);
            expect(vectorService.updateDocumentMetadata).not.toHaveBeenCalled();
        });

        it('should allow admin to update any document', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { title: 'Admin Override' };
            mockRequest.user = { email: 'admin@aikb.com', role: 'ADMIN' };
            
            // Mock getAllMetadata to return doc owned by someone else
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                '1': { owner: 'alice@aikb.com', category: 'IT' }
            });
            vi.mocked(driveService.renameFile).mockResolvedValue(true);
            
            await DocumentController.update(mockRequest, mockResponse);
            
            expect(vectorService.updateDocumentMetadata).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });
    });
});
