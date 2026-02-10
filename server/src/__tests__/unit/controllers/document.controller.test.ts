import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocumentController } from '../../../controllers/document.controller.js';
import { driveService, vectorService, syncService, historyService } from '../../../container.js';

vi.mock('../../../container.js', () => ({
  driveService: {
    uploadFile: vi.fn(),
    listFiles: vi.fn(),
    getFileMetadata: vi.fn(),
    checkHealth: vi.fn(),
    renameFile: vi.fn(),
    deleteFile: vi.fn()
  },
  vectorService: {
    updateDocumentMetadata: vi.fn(),
    getAllMetadata: vi.fn(),
    deleteDocument: vi.fn(),
    listDocumentsWithRBAC: vi.fn()
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
    let nextMock: any;

    beforeEach(() => {
        jsonMock = vi.fn();
        statusMock = vi.fn().mockReturnValue({ json: jsonMock });
        nextMock = vi.fn();

        mockRequest = {};
        mockResponse = {
            status: statusMock,
            json: jsonMock
        };
        vi.resetAllMocks();
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'real-folder';
    });

    describe('upload', () => {
        it('should return 400 for upload if no file via next', async () => {
            await DocumentController.upload(mockRequest, mockResponse, nextMock);
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
        });

        it('should process upload sequence', async () => {
            mockRequest.file = { path: 'tmp/path', mimetype: 'app/pdf', originalname: 'test.pdf' };
            mockRequest.body = { category: 'IT' };
            
            vi.mocked(driveService.uploadFile).mockResolvedValue('file-id-1');

            await DocumentController.upload(mockRequest, mockResponse, nextMock);

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
             vi.mocked(vectorService.listDocumentsWithRBAC).mockResolvedValue([
                 { id: '1', title: 'HR Doc', department: 'HR' }
             ]);

             await DocumentController.list(mockRequest, mockResponse, nextMock);
             
             expect(jsonMock).toHaveBeenCalled();
             const result = jsonMock.mock.calls[0][0];
             expect(result).toHaveLength(1);
             expect(result[0].id).toBe('1');
        });
    });

    describe('syncAll', () => {
        it('should return operational error when drive folder is not configured', async () => {
            process.env.GOOGLE_DRIVE_FOLDER_ID = '';

            await DocumentController.syncAll(mockRequest, mockResponse, nextMock);

            expect(syncService.syncAll).not.toHaveBeenCalled();
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 503,
                message: expect.stringContaining('Google Drive is not configured')
            }));
        });

        it('should map sync failures to an operational error', async () => {
            process.env.GOOGLE_DRIVE_FOLDER_ID = 'real-folder';
            vi.mocked(syncService.syncAll).mockRejectedValue(new Error('invalid_grant'));

            await DocumentController.syncAll(mockRequest, mockResponse, nextMock);

            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 503,
                message: expect.stringContaining('Sync failed')
            }));
        });
    });


    describe('delete', () => {
        it('should delete drive-backed document from source and index', async () => {
            mockRequest.params = { id: '123' };
            mockRequest.user = { email: 'admin@aikb.com' };

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(driveService.deleteFile).toHaveBeenCalledWith('123');
            expect(vectorService.deleteDocument).toHaveBeenCalledWith('123');
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETED',
                doc_id: '123'
            }));
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });

        it('should skip drive delete for manual documents', async () => {
            mockRequest.params = { id: 'manual-123' };
            mockRequest.user = { email: 'admin@aikb.com' };

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(driveService.deleteFile).not.toHaveBeenCalled();
            expect(vectorService.deleteDocument).toHaveBeenCalledWith('manual-123');
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETED',
                doc_id: 'manual-123'
            }));
        });

        it('should skip drive delete when drive is not configured', async () => {
            mockRequest.params = { id: 'doc-local-1' };
            mockRequest.user = { email: 'admin@aikb.com' };
            process.env.GOOGLE_DRIVE_FOLDER_ID = '';

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(driveService.deleteFile).not.toHaveBeenCalled();
            expect(vectorService.deleteDocument).toHaveBeenCalledWith('doc-local-1');
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETED',
                details: expect.stringContaining('Source: local/manual')
            }));
        });

        it('should fail delete when drive deletion fails for drive-backed documents', async () => {
            mockRequest.params = { id: 'drive-123' };
            mockRequest.user = { email: 'admin@aikb.com' };
            vi.mocked(driveService.deleteFile).mockRejectedValue(new Error('forbidden'));

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(vectorService.deleteDocument).not.toHaveBeenCalled();
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({
                statusCode: 502,
                message: expect.stringContaining('Unable to delete source file')
            }));
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETE_FAILED',
                doc_id: 'drive-123'
            }));
        });

        it('should canonicalize chunk ids on delete', async () => {
            mockRequest.params = { id: 'doc3_chunk0' };
            mockRequest.user = { email: 'admin@aikb.com' };

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(driveService.deleteFile).toHaveBeenCalledWith('doc3');
            expect(vectorService.deleteDocument).toHaveBeenCalledWith('doc3');
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETED',
                doc_id: 'doc3'
            }));
        });


        it('should canonicalize numeric suffix chunk ids on delete', async () => {
            mockRequest.params = { id: 'manual-123_0' };
            mockRequest.user = { email: 'admin@aikb.com' };

            await DocumentController.delete(mockRequest, mockResponse, nextMock);

            expect(vectorService.deleteDocument).toHaveBeenCalledWith('manual-123');
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                event_type: 'DELETED',
                doc_id: 'manual-123'
            }));
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
            
            await DocumentController.update(mockRequest, mockResponse, nextMock);
            
            expect(vectorService.updateDocumentMetadata).toHaveBeenCalled();
            expect(driveService.renameFile).toHaveBeenCalledWith('1', 'New Title');
            expect(historyService.recordEvent).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });

        it('should mark drive rename as not_applicable for manual docs when drive is disabled', async () => {
            mockRequest.params = { id: 'manual-1' };
            mockRequest.body = { title: 'New Local Title' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };
            process.env.GOOGLE_DRIVE_FOLDER_ID = '';

            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                'manual-1': { owner: 'alice@aikb.com', category: 'IT' }
            });

            await DocumentController.update(mockRequest, mockResponse, nextMock);

            expect(driveService.renameFile).not.toHaveBeenCalled();
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                details: expect.stringContaining('Drive Rename: not_applicable')
            }));
        });



        it('should mark drive rename as not_configured for drive docs when drive is disabled', async () => {
            mockRequest.params = { id: 'drive-1' };
            mockRequest.body = { title: 'New Drive Title' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };
            process.env.GOOGLE_DRIVE_FOLDER_ID = '';

            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                'drive-1': { owner: 'alice@aikb.com', category: 'IT' }
            });

            await DocumentController.update(mockRequest, mockResponse, nextMock);

            expect(driveService.renameFile).not.toHaveBeenCalled();
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                details: expect.stringContaining('Drive Rename: not_configured')
            }));
        });

        it('should mark drive rename as not_applicable for manual docs when drive is configured', async () => {
            mockRequest.params = { id: 'manual-1' };
            mockRequest.body = { title: 'New Local Title' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };
            process.env.GOOGLE_DRIVE_FOLDER_ID = 'real-folder';

            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                'manual-1': { owner: 'alice@aikb.com', category: 'IT' }
            });

            await DocumentController.update(mockRequest, mockResponse, nextMock);

            expect(driveService.renameFile).not.toHaveBeenCalled();
            expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
                details: expect.stringContaining('Drive Rename: not_applicable')
            }));
        });

        it('should canonicalize chunk ids on update', async () => {
            mockRequest.params = { id: 'doc3_chunk0' };
            mockRequest.body = { title: 'Doc 3' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };

            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                'doc3': { owner: 'alice@aikb.com', category: 'IT' }
            });
            vi.mocked(driveService.renameFile).mockResolvedValue(true);

            await DocumentController.update(mockRequest, mockResponse, nextMock);

            expect(vectorService.updateDocumentMetadata).toHaveBeenCalledWith('doc3', expect.anything());
            expect(driveService.renameFile).toHaveBeenCalledWith('doc3', 'Doc 3');
        });


        it('should canonicalize numeric suffix chunk ids on update', async () => {
            mockRequest.params = { id: 'manual-123_0' };
            mockRequest.body = { title: 'Manual Title' };
            mockRequest.user = { email: 'alice@aikb.com', role: 'EDITOR' };

            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                'manual-123': { owner: 'alice@aikb.com', category: 'IT' }
            });

            await DocumentController.update(mockRequest, mockResponse, nextMock);

            expect(vectorService.updateDocumentMetadata).toHaveBeenCalledWith('manual-123', expect.anything());
        });

        it('should reject update when user is not owner or admin', async () => {
            mockRequest.params = { id: '1' };
            mockRequest.body = { title: 'Hacked Title' };
            mockRequest.user = { email: 'attacker@aikb.com', role: 'VIEWER' };
            
            // Mock getAllMetadata to return doc owned by someone else
            vi.mocked(vectorService.getAllMetadata).mockResolvedValue({
                '1': { owner: 'alice@aikb.com', category: 'IT' }
            });
            
            await DocumentController.update(mockRequest, mockResponse, nextMock);
            
            expect(nextMock).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
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
            
            await DocumentController.update(mockRequest, mockResponse, nextMock);
            
            expect(vectorService.updateDocumentMetadata).toHaveBeenCalled();
            expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
        });
    });
});
