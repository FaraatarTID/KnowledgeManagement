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
});
