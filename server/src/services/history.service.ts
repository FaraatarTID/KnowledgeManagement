import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface HistoryEvent {
  event_type: 'CREATED' | 'UPDATED' | 'DELETED';
  doc_id: string;
  doc_name: string;
  details?: string;
  user_id?: string;
}

export class HistoryService {
  private supabase: SupabaseClient | null = null;
  private isMock: boolean = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      console.log('HistoryService: Supabase client initialized.');
    } else {
      console.warn('HistoryService: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Entering MOCK MODE.');
      this.isMock = true;
    }
  }

  async recordEvent(event: HistoryEvent) {
    if (this.isMock || !this.supabase) {
      console.log(`[MOCK HISTORY] ${event.event_type}: ${event.doc_name} (${event.doc_id}) - ${event.details || 'N/A'}`);
      return;
    }

    try {
      const { error } = await this.supabase
        .from('document_history')
        .insert([
          {
            ...event,
            created_at: new Date().toISOString(),
          }
        ]);

      if (error) throw error;
    } catch (e) {
      console.error('HistoryService: Failed to record event', e);
    }
  }

  async getHistory(limit: number = 100) {
    if (this.isMock || !this.supabase) {
      return [
        { id: 'mock-1', created_at: new Date().toISOString(), event_type: 'UPDATED', doc_name: 'Policy A', doc_id: 'd1', details: 'Manual sync triggered' }
      ];
    }

    try {
      const { data, error } = await this.supabase
        .from('document_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data;
    } catch (e) {
      console.error('HistoryService: Failed to fetch history', e);
      return [];
    }
  }
}
