import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger.js';
import { DriveService } from './drive.service.js';
import { env } from '../config/env.js';

export class BackupService {
  private driveService: DriveService;
  private dbPath: string;

  constructor(driveService: DriveService) {
    this.driveService = driveService;
    this.dbPath = path.join(process.cwd(), 'data', 'vectors.db');
  }

  /**
   * Syncs the local SQLite database to Google Drive
   */
  async backupToCloud(): Promise<{ success: boolean; fileId?: string; error?: string }> {
    try {
      if (!fs.existsSync(this.dbPath)) {
        throw new Error('Local database file not found.');
      }

      if (!env.GOOGLE_DRIVE_FOLDER_ID) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID is not configured.');
      }

      Logger.info('BackupService: Starting cloud backup of vectors.db...');
      
      const filename = `aikb_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
      
      const fileId = await this.driveService.uploadFile(
        env.GOOGLE_DRIVE_FOLDER_ID,
        filename,
        this.dbPath,
        'application/x-sqlite3'
      );

      Logger.info('BackupService: Cloud backup successful', { fileId, filename });
      return { success: true, fileId };
      
    } catch (error: any) {
      Logger.error('BackupService: Cloud backup failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * Restores the local SQLite database from a specific Google Drive file
   */
  async restoreFromCloud(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      Logger.info('BackupService: Restoring database from cloud...', { fileId });
      
      const buffer = await this.driveService.downloadFile(fileId);
      
      // Backup current file first if it exists
      if (fs.existsSync(this.dbPath)) {
        fs.copyFileSync(this.dbPath, `${this.dbPath}.pre_restore.bak`);
      }
      
      fs.writeFileSync(this.dbPath, buffer);
      
      Logger.info('BackupService: Restore successful. Restart required.');
      return { success: true };
      
    } catch (error: any) {
      Logger.error('BackupService: Restore failed', { error: error.message });
      return { success: false, error: error.message };
    }
  }
}
