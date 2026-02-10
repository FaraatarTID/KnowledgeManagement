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

describe('VectorService.listDocumentsWithRBAC', () => {
  it('prefers canonical docId over chunk id when listing documents', async () => {
    const store: MetadataStore = {
      getOverride: vi.fn(),
      getAllOverrides: vi.fn().mockReturnValue({}),
      setOverride: vi.fn(),
      removeOverride: vi.fn(),
      removeOverrides: vi.fn(),
      checkHealth: vi.fn().mockReturnValue(true),
      listDocuments: vi.fn().mockResolvedValue([
        { id: 'manual-1_0', docId: 'manual-1', title: 'Doc 1', department: 'General' }
      ])
    };

    const service = new VectorService('', 'us-central1', store, true);

    const docs = await service.listDocumentsWithRBAC({
      userId: 'u1',
      role: 'ADMIN',
      department: 'General'
    });

    expect(docs[0]?.id).toBe('manual-1');
  });
});


describe('VectorService role normalization for RBAC retrieval', () => {
  const buildService = () => {
    const store: MetadataStore = {
      getOverride: vi.fn(),
      getAllOverrides: vi.fn().mockReturnValue({}),
      setOverride: vi.fn(),
      removeOverride: vi.fn(),
      removeOverrides: vi.fn(),
      checkHealth: vi.fn().mockReturnValue(true)
    };

    return new VectorService('', 'us-central1', store, true) as any;
  };

  it('maps legacy role labels to canonical roles', () => {
    const service = buildService();

    expect(service.normalizeRole('user')).toBe('VIEWER');
    expect(service.normalizeRole('IC')).toBe('VIEWER');
    expect(service.normalizeRole('editor')).toBe('EDITOR');
  });

  it('expands allowed role tokens hierarchically', () => {
    const service = buildService();

    expect(service.getAllowedRoleTokens('VIEWER')).toEqual(['VIEWER', 'USER', 'IC']);
    expect(service.getAllowedRoleTokens('EDITOR')).toEqual(['EDITOR', 'VIEWER', 'USER', 'IC']);
    expect(service.getAllowedRoleTokens('ADMIN')).toContain('MANAGER');
  });
});
