import { google, drive_v3 } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

export class DriveService {
  private drive: drive_v3.Drive | null = null;
  private enabled: boolean;

  constructor(authKeyPath: string, enabled: boolean = true) {
    this.enabled = enabled;

    if (!this.enabled) {
      return;
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: authKeyPath,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  private requireDriveClient(): drive_v3.Drive {
    if (!this.enabled || !this.drive) {
      throw new Error('Google Drive is not configured (LOCAL DOCUMENT MODE).');
    }

    return this.drive;
  }

  async uploadFile(folderId: string, fileName: string, filePath: string, mimeType: string): Promise<string> {
    try {
      const drive = this.requireDriveClient();
      const response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType: mimeType,
          body: fs.createReadStream(filePath)
        },
        fields: 'id'
      });

      return response.data.id || '';
    } catch (e) {
      console.error(`DriveService: Failed to upload file ${fileName}`, e);
      throw e;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      const drive = this.requireDriveClient();
      await drive.files.delete({
        fileId: fileId
      });
    } catch (e) {
      console.error(`DriveService: Failed to delete file ${fileId}`, e);
      throw e;
    }
  }

  async renameFile(fileId: string, newName: string): Promise<boolean> {
    try {
      const drive = this.requireDriveClient();
      await drive.files.update({
        fileId: fileId,
        requestBody: {
          name: newName
        }
      });
      return true;
    } catch (e) {
      console.error(`DriveService: Failed to rename file ${fileId}`, e);
      return false;
    }
  }

  async listFiles(folderId: string): Promise<drive_v3.Schema$File[]> {
    let allFiles: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined = undefined;

    do {
      const params: any = {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, owners, permissions)',
        pageSize: 1000
      };
      
      if (pageToken) {
        params.pageToken = pageToken;
      }

      const drive = this.requireDriveClient();
      const response = await drive.files.list(params);
      
      if (response.data.files) {
        allFiles = allFiles.concat(response.data.files);
      }
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return allFiles;
  }

  async exportDocument(fileId: string, mimeType: string = 'text/plain'): Promise<string> {
    const drive = this.requireDriveClient();
    const response = await drive.files.export({
      fileId: fileId,
      mimeType: mimeType
    }, { responseType: 'text' });
    return response.data as string;
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    // SECURITY: Memory Guard
    // Check file size before downloading to prevent OOM (Max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024; 
    const meta = await this.getFileMetadata(fileId);
    if (meta?.size && parseInt(meta.size) > MAX_SIZE) {
      throw new Error(`File too large for memory processing: ${Math.round(parseInt(meta.size) / 1024 / 1024)}MB. Limit: 100MB.`);
    }

    try {
      const drive = this.requireDriveClient();
      const response = await drive.files.get({
        fileId: fileId,
        alt: 'media'
      }, { responseType: 'arraybuffer' });
      return Buffer.from(response.data as ArrayBuffer);
    } catch (e) {
      console.error(`DriveService: Failed to download file ${fileId}`, e);
      throw e;
    }
  }

  async watchFolder(folderId: string, webhookUrl: string) {
    const drive = this.requireDriveClient();
    const channel = await drive.files.watch({
      fileId: folderId,
      requestBody: {
        id: uuidv4(),
        type: 'web_hook',
        address: webhookUrl,
        expiration: (Date.now() + (7 * 24 * 60 * 60 * 1000)).toString() // 7 days
      }
    });
    return channel.data;
  }

  async getFileMetadata(fileId: string): Promise<drive_v3.Schema$File | null> {
    try {
      const drive = this.requireDriveClient();
      const response = await drive.files.get({
        fileId: fileId,
        fields: 'id, name, mimeType, webViewLink, modifiedTime, owners, size'
      });
      return response.data;
    } catch (e) {
      console.error(`DriveService: Failed to get metadata for ${fileId}`, e);
      return null;
    }
  }

  async checkPermission(fileId: string, userEmail: string): Promise<boolean> {
    try {
      const drive = this.requireDriveClient();
      const response = await drive.permissions.list({
        fileId: fileId,
        fields: 'permissions(emailAddress, role)'
      });
      return (response.data.permissions || []).some(
        p => p.emailAddress === userEmail
      );
    } catch (e) {
      return false;
    }
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    try {
      // Test by listing root folder (just 1 file)
      if (!this.enabled) {
        return { status: 'OK', message: 'Google Drive disabled (LOCAL DOCUMENT MODE)' };
      }

      const drive = this.requireDriveClient();
      await drive.files.list({ pageSize: 1 });
      return { status: 'OK', message: 'Connected to Google Drive' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Drive Error: ${e.message}` };
    }
  }
}
