import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface HistoryEvent {
  event_type: string;
  doc_id?: string;
  doc_name?: string;
  details?: string;
  user_id?: string;
  [key: string]: any;
}

export class HistoryService {
  private supabase: SupabaseClient | null = null;
  private sqlite?: any; // SqliteMetadataService
  private isLocalMode: boolean = false;
  private isMock: boolean = false;

  constructor(sqlite?: any) {
    this.sqlite = sqlite;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key && url !== '') {
      this.supabase = createClient(url, key);
      Logger.info('HistoryService: Supabase client initialized.');
    } else if (this.sqlite) {
      this.isLocalMode = true;
      Logger.info('HistoryService: Supabase missing. Initialized in LOCAL MODE (SQLite).');
    } else {
      Logger.info('HistoryService: Supabase and SQLite missing; entering MOCK MODE (expected in some tests).');
      this.isMock = true;
    }
  }

  async recordEvent(event: HistoryEvent) {
    if (this.isMock) {
      console.log(`[MOCK HISTORY] ${event.event_type}: ${event.doc_name} (${event.doc_id}) - ${event.details || 'N/A'}`);
      return;
    }

    try {
      if (this.isLocalMode) {
        this.sqlite.getDatabase()
          .prepare('INSERT INTO history (id, event_type, doc_id, doc_name, details, user_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(
            uuidv4(),
            event.event_type,
            event.doc_id || null,
            event.doc_name || null,
            event.details || null,
            event.user_id || null,
            JSON.stringify(event)
          );
      } else if (this.supabase) {
        const { error } = await this.supabase
          .from('document_history')
          .insert([
            {
              ...event,
              created_at: new Date().toISOString(),
            }
          ]);

        if (error) throw error;
      }
    } catch (e) {
      Logger.error('HistoryService: Failed to record event', e);
    }
  }

  async getHistory(limit: number = 100) {
    if (this.isMock) {
      return [
        { id: 'mock-1', created_at: new Date().toISOString(), event_type: 'UPDATED', doc_name: 'Policy A', doc_id: 'd1', details: 'Manual sync triggered' }
      ];
    }

    try {
      if (this.isLocalMode) {
        const rows = this.sqlite.getDatabase()
          .prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?')
          .all(limit);
        return rows;
      } else if (this.supabase) {
        const { data, error } = await this.supabase
          .from('document_history')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw error;
        return data;
      }
      return [];
    } catch (e) {
      Logger.error('HistoryService: Failed to fetch history', e);
      return [];
    }
  }
}
