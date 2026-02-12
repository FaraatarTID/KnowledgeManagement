import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import { SyncService } from '../../../services/sync.service.js';

describe('SyncService', () => {
  it('uses injected history service during prune operations', async () => {
    const driveService = {
      listFiles: vi.fn().mockResolvedValue([])
    } as any;

    const vectorService = {
      getAllMetadata: vi.fn().mockResolvedValue({ 'drive-doc-1': { title: 'Doc' } }),
      deleteDocument: vi.fn().mockResolvedValue(undefined)
    } as any;

    const geminiService = {} as any;
    const historyService = {
      recordEvent: vi.fn().mockResolvedValue(undefined)
    } as any;

    const syncService = new SyncService(driveService, vectorService, geminiService, historyService);

    const result = await syncService.syncAll('folder-id');

    expect(result).toEqual({ status: 'success', processed: 0 });
    expect(vectorService.deleteDocument).toHaveBeenCalledWith('drive-doc-1');
    expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'PRUNED'
    }));
  });

  it('uses local file path for extraction without drive download', async () => {
    const tempPath = 'data/uploads/sync-local-test.pdf';
    fs.mkdirSync('data/uploads', { recursive: true });
    fs.writeFileSync(tempPath, Buffer.from('%PDF-1.4 local sync test'));

    const driveService = {
      downloadFile: vi.fn(),
      exportDocument: vi.fn()
    } as any;

    const vectorService = {
      getAllMetadata: vi.fn().mockResolvedValue({}),
      upsertVectors: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined)
    } as any;

    const geminiService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    } as any;

    const historyService = {
      recordEvent: vi.fn().mockResolvedValue(undefined)
    } as any;

    const syncService = new SyncService(driveService, vectorService, geminiService, historyService);
    (syncService as any).extractionService = {
      extractFromBuffer: vi.fn().mockResolvedValue('local mode extracted content for indexing')
    };

    try {
      await syncService.indexFile(
        { id: 'manual-1', name: 'local.pdf', mimeType: 'application/pdf' },
        undefined,
        { localFilePath: tempPath }
      );

      expect(driveService.downloadFile).not.toHaveBeenCalled();
      expect(vectorService.upsertVectors).toHaveBeenCalled();
      expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
        details: expect.stringContaining('Source: local')
      }));
    } finally {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  });

  it('records extraction failure with local source when local file is missing', async () => {
    const driveService = {
      downloadFile: vi.fn(),
      exportDocument: vi.fn()
    } as any;

    const vectorService = {
      getAllMetadata: vi.fn().mockResolvedValue({}),
      upsertVectors: vi.fn().mockResolvedValue(undefined),
      deleteDocument: vi.fn().mockResolvedValue(undefined)
    } as any;

    const geminiService = {
      generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    } as any;

    const historyService = {
      recordEvent: vi.fn().mockResolvedValue(undefined)
    } as any;

    const syncService = new SyncService(driveService, vectorService, geminiService, historyService);

    await expect(syncService.indexFile(
      { id: 'manual-2', name: 'missing.pdf', mimeType: 'application/pdf' },
      undefined,
      { localFilePath: 'data/uploads/does-not-exist.pdf' }
    )).rejects.toThrow('No extractable content from local source');

    expect(driveService.downloadFile).not.toHaveBeenCalled();
    expect(vectorService.upsertVectors).not.toHaveBeenCalled();
    expect(historyService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'EXTRACTION_FAILED',
      details: expect.stringContaining('failed (local)')
    }));
  });
});
