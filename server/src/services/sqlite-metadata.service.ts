import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger } from '../utils/logger.js';
import type { MetadataStore, MetadataOverride } from './metadata.store.js';

export class SqliteMetadataService implements MetadataStore {
  private db: Database.Database;
  private readonly dbPath: string;

  constructor(storagePath?: string) {
    this.dbPath = storagePath || path.join(process.cwd(), 'data', 'vectors.db');
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(this.dbPath, { timeout: 5000 });
    this.init();
    this.migrateFromJson();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        id TEXT PRIMARY KEY,
        data JSON NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'VIEWER',
        department TEXT DEFAULT 'General',
        status TEXT DEFAULT 'Active',
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        doc_id TEXT,
        doc_name TEXT,
        details TEXT,
        user_id TEXT,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create index for faster JSON queries if needed in future
    // this.db.exec(`CREATE INDEX IF NOT EXISTS idx_metadata_type ON metadata(json_extract(data, '$.docId'))`);
  }

  private migrateFromJson() {
    const jsonPath = path.join(process.cwd(), 'data', 'metadata_overrides.json');
    if (fs.existsSync(jsonPath)) {
      try {
        Logger.info('SqliteMetadataService: Found legacy JSON metadata. Starting migration...');
        const content = fs.readFileSync(jsonPath, 'utf8');
        const data = JSON.parse(content);
        
        const insert = this.db.prepare('INSERT OR REPLACE INTO metadata (id, data) VALUES (?, ?)');
        const update = this.db.transaction((entries: [string, any][]) => {
          for (const [id, value] of entries) {
            insert.run(id, JSON.stringify(value));
          }
        });

        update(Object.entries(data));
        
        // Rename legacy file
        fs.renameSync(jsonPath, `${jsonPath}.bak`);
        Logger.info(`SqliteMetadataService: Migration complete. ${Object.keys(data).length} entries imported. Legacy file renamed to .bak`);
      } catch (error) {
        Logger.error('SqliteMetadataService: Migration failed', { error });
      }
    }
  }

  getOverride(docId: string): MetadataOverride | undefined {
    try {
      const row = this.db.prepare('SELECT data FROM metadata WHERE id = ?').get(docId) as { data: string } | undefined;
      return row ? JSON.parse(row.data) : undefined;
    } catch (error) {
      Logger.error('SqliteMetadataService: getOverride failed', { error, docId });
      return undefined;
    }
  }

  getAllOverrides(): Record<string, MetadataOverride> {
    try {
      const rows = this.db.prepare('SELECT id, data FROM metadata').all() as { id: string; data: string }[];
      const result: Record<string, MetadataOverride> = {};
      for (const row of rows) {
        result[row.id] = JSON.parse(row.data);
      }
      return result;
    } catch (error: any) {
      Logger.error('SqliteMetadataService: getAllOverrides failed', { 
        message: error.message,
        code: error.code
      });
      return {};
    }
  }

  async setOverride(docId: string, metadata: MetadataOverride): Promise<void> {
    try {
      // First get existing to merge
      const existing = this.getOverride(docId) || {};
      const merged = { ...existing, ...metadata };
      
      this.db.prepare('INSERT OR REPLACE INTO metadata (id, data) VALUES (?, ?)').run(docId, JSON.stringify(merged));
    } catch (error) {
      Logger.error('SqliteMetadataService: setOverride failed', { error, docId });
      throw error;
    }
  }

  async removeOverride(docId: string): Promise<void> {
    try {
      this.db.prepare('DELETE FROM metadata WHERE id = ?').run(docId);
    } catch (error) {
      Logger.error('SqliteMetadataService: removeOverride failed', { error, docId });
      throw error;
    }
  }

  async removeOverrides(docIds: string[]): Promise<void> {
    try {
      const deleteStmt = this.db.prepare('DELETE FROM metadata WHERE id = ?');
      const transaction = this.db.transaction((ids: string[]) => {
        for (const id of ids) {
          deleteStmt.run(id);
        }
      });
      transaction(docIds);
    } catch (error) {
      Logger.error('SqliteMetadataService: removeOverrides failed', { error, count: docIds.length });
      throw error;
    }
  }

  checkHealth(): boolean {
    try {
      return !!this.db.prepare('SELECT 1').get();
    } catch (e) {
      return false;
    }
  }

  async listDocuments(params: { department?: string; limit?: number; offset?: number }): Promise<MetadataOverride[]> {
    try {
      let query = "SELECT data FROM metadata WHERE (json_extract(data, '$.__vectorEntry') IS NULL OR json_extract(data, '$.__vectorEntry') != 1)";
      const args: any[] = [];

      if (params.department) {
        query += " AND json_extract(data, '$.department') = ?";
        args.push(params.department);
      }

      // Default limit if not specified to prevent accidental massive loads
      const limit = params.limit || 1000;
      query += " LIMIT ?";
      args.push(limit);

      if (params.offset) {
        query += " OFFSET ?";
        args.push(params.offset);
      }

      const rows = this.db.prepare(query).all(...args) as { data: string }[];
      return rows.map(row => JSON.parse(row.data));
    } catch (error) {
       Logger.error('SqliteMetadataService: listDocuments failed', { error });
       return [];
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  disconnect() {
    this.db.close();
  }
}
