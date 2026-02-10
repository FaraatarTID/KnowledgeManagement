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
  private mockEvents: Array<Record<string, any>> = [];

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

  private writeToSqlite(event: HistoryEvent) {
    if (!this.sqlite) {
      throw new Error('SQLite service unavailable');
    }

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
  }

  private canFallbackToSqlite(): boolean {
    return !this.isLocalMode && !!this.sqlite;
  }

  async recordEvent(event: HistoryEvent) {
    if (this.isMock) {
      this.mockEvents.unshift({
        id: uuidv4(),
        created_at: new Date().toISOString(),
        ...event
      });

      if (this.mockEvents.length > 1000) {
        this.mockEvents = this.mockEvents.slice(0, 1000);
      }

      Logger.info('HistoryService: Recorded in-memory history event (MOCK MODE)', {
        eventType: event.event_type,
        docId: event.doc_id
      });
      return;
    }

    try {
      if (this.isLocalMode) {
        this.writeToSqlite(event);
      } else if (this.supabase) {
        const { error } = await this.supabase
          .from('document_history')
          .insert([
            {
              ...event,
              created_at: new Date().toISOString(),
            }
          ]);

        if (error) {
          throw error;
        }
      }
    } catch (e) {
      if (this.canFallbackToSqlite()) {
        Logger.warn('HistoryService: Supabase record failed, trying SQLite fallback.', {
          error: e instanceof Error ? e.message : String(e)
        });
      } else {
        Logger.error('HistoryService: Failed to record event', e);
      }

      // Fallback: when Supabase write fails but SQLite exists, keep local audit trail.
      if (this.canFallbackToSqlite()) {
        try {
          this.writeToSqlite(event);
          Logger.warn('HistoryService: Fell back to SQLite history after Supabase failure.');
        } catch (sqliteError) {
          Logger.error('HistoryService: SQLite fallback also failed', sqliteError);
        }
      }
    }
  }

  async getHistory(limit: number = 100) {
    if (this.isMock) {
      return this.mockEvents.slice(0, limit);
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
      if (this.canFallbackToSqlite()) {
        Logger.warn('HistoryService: Supabase history fetch failed, trying SQLite fallback.', {
          error: e instanceof Error ? e.message : String(e)
        });
      } else {
        Logger.error('HistoryService: Failed to fetch history', e);
      }

      if (this.canFallbackToSqlite()) {
        try {
          Logger.warn('HistoryService: Falling back to SQLite history fetch after Supabase failure.');
          const rows = this.sqlite.getDatabase()
            .prepare('SELECT * FROM history ORDER BY created_at DESC LIMIT ?')
            .all(limit);
          return rows;
        } catch (sqliteError) {
          Logger.error('HistoryService: SQLite fallback fetch failed', sqliteError);
        }
      }

      return [];
    }
  }
}
