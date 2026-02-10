import { describe, it, expect, vi } from 'vitest';
import { VectorService } from '../../../services/vector.service.js';
import type { MetadataStore } from '../../../services/metadata.store.js';

describe('VectorService.deleteDocument', () => {
  it('removes document metadata even when no vector entries exist', async () => {
    const removeOverride = vi.fn().mockResolvedValue(undefined);
    const removeOverrides = vi.fn().mockResolvedValue(undefined);

    const store: MetadataStore = {
      getOverride: vi.fn(),
      getAllOverrides: vi.fn().mockReturnValue({
        test1: { title: 'Untitled', docId: 'test1' }
      }),
      setOverride: vi.fn(),
      removeOverride,
      removeOverrides,
      checkHealth: vi.fn().mockReturnValue(true)
    };

    const service = new VectorService('', 'us-central1', store, true);

    await service.deleteDocument('test1');

    expect(removeOverride).toHaveBeenCalledWith('test1');
    expect(removeOverrides).not.toHaveBeenCalled();
  });

  it('prefers docId and title fields when listing documents', async () => {
    const store: MetadataStore = {
      getOverride: vi.fn(),
      getAllOverrides: vi.fn().mockReturnValue({}),
      setOverride: vi.fn(),
      removeOverride: vi.fn(),
      removeOverrides: vi.fn(),
      checkHealth: vi.fn().mockReturnValue(true),
      listDocuments: vi.fn().mockResolvedValue([
        {
          id: 'manual-1770729065996_chunk0',
          docId: 'manual-1770729065996',
          name: 'Legacy Name',
          title: 'Updated Title',
          department: 'General'
        }
      ])
    };

    const service = new VectorService('', 'us-central1', store, true);

    const docs = await service.listDocumentsWithRBAC({
      userId: '1',
      department: 'General',
      role: 'ADMIN'
    });

    expect(docs).toEqual([
      expect.objectContaining({
        id: 'manual-1770729065996',
        title: 'Updated Title'
      })
    ]);
  });
});
