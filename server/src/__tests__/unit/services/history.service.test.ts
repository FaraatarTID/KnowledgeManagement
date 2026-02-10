import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const selectAllMock = vi.fn();
const fromMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: fromMock
  }))
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid')
}));

import { HistoryService } from '../../../services/history.service.js';

describe('HistoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    insertMock.mockReset();
    selectAllMock.mockReset();
    fromMock.mockReset();
  });

  const sqlite = {
    getDatabase: () => ({
      prepare: (query: string) => {
        if (query.startsWith('INSERT INTO history')) {
          return { run: insertMock };
        }
        if (query.startsWith('SELECT * FROM history')) {
          return { all: selectAllMock };
        }
        throw new Error(`Unexpected query: ${query}`);
      }
    })
  };

  it('stores and returns events in mock mode instead of hardcoded fake event', async () => {
    const service = new HistoryService();

    await service.recordEvent({
      event_type: 'DELETED',
      doc_id: 'doc-1',
      details: 'Deleted by admin'
    });

    const history = await service.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      event_type: 'DELETED',
      doc_id: 'doc-1',
      details: 'Deleted by admin'
    });
  });

  it('falls back to sqlite when supabase insert fails', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

    const insert = vi.fn().mockResolvedValue({ error: new Error('supabase down') });
    fromMock.mockReturnValue({ insert });

    const service = new HistoryService(sqlite);

    await service.recordEvent({ event_type: 'UPDATED', doc_id: 'doc-2' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to sqlite when supabase history read fails', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';

    const limit = vi.fn().mockResolvedValue({ data: null, error: new Error('query failed') });
    const order = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ order }));
    fromMock.mockReturnValue({ select });

    selectAllMock.mockReturnValue([{ id: 'h1', event_type: 'DELETED' }]);

    const service = new HistoryService(sqlite);

    const history = await service.getHistory(10);

    expect(history).toEqual([{ id: 'h1', event_type: 'DELETED' }]);
    expect(selectAllMock).toHaveBeenCalledWith(10);
  });
});
