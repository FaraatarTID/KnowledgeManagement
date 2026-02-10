import { describe, it, expect, vi } from 'vitest';
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
});
