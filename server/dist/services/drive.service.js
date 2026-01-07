import { google, drive_v3 } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
export class DriveService {
    drive = null;
    isMock = false;
    constructor(authKeyPath) {
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: authKeyPath,
                scopes: [
                    'https://www.googleapis.com/auth/drive', // Upgraded to full access for renaming
                    'https://www.googleapis.com/auth/drive.file'
                ]
            });
            this.drive = google.drive({ version: 'v3', auth });
        }
        catch (e) {
            console.warn('DriveService: Failed to initialize Google Drive client (missing key file?). Entering MOCK MODE.');
            this.isMock = true;
        }
    }
    async uploadFile(folderId, fileName, filePath, mimeType) {
        if (this.isMock || !this.drive) {
            const mockId = `mock-upload-${Date.now()}`;
            console.log(`DriveService [MOCK]: Uploaded ${fileName} to folder ${folderId}. Assigned ID: ${mockId}`);
            return mockId;
        }
        try {
            const response = await this.drive.files.create({
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
        }
        catch (e) {
            console.error(`DriveService: Failed to upload file ${fileName}`, e);
            throw e;
        }
    }
    async renameFile(fileId, newName) {
        if (this.isMock || !this.drive) {
            console.log(`DriveService [MOCK]: Renamed ${fileId} to ${newName}`);
            return true;
        }
        try {
            await this.drive.files.update({
                fileId: fileId,
                requestBody: {
                    name: newName
                }
            });
            return true;
        }
        catch (e) {
            console.error(`DriveService: Failed to rename file ${fileId}`, e);
            return false;
        }
    }
    async listFiles(folderId) {
        if (this.isMock || !this.drive) {
            console.log('DriveService: Recurring mock files for listFiles');
            return [
                { id: 'mock-1', name: 'Mock Project Plan.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString(), webViewLink: 'https://docs.google.com/document/d/mock-1' },
                { id: 'mock-2', name: 'Mock Budget 2024.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: new Date().toISOString(), webViewLink: 'https://docs.google.com/spreadsheets/d/mock-2' }
            ];
        }
        let allFiles = [];
        let pageToken = undefined;
        do {
            const params = {
                q: `'${folderId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, mimeType, webViewLink, modifiedTime, owners, permissions)',
                pageSize: 1000
            };
            if (pageToken) {
                params.pageToken = pageToken;
            }
            const response = await this.drive.files.list(params);
            if (response.data.files) {
                allFiles = allFiles.concat(response.data.files);
            }
            pageToken = response.data.nextPageToken || undefined;
        } while (pageToken);
        return allFiles;
    }
    async exportDocument(fileId, mimeType = 'text/plain') {
        if (this.isMock || !this.drive)
            return '[MOCK CONTENT]';
        const response = await this.drive.files.export({
            fileId: fileId,
            mimeType: mimeType
        }, { responseType: 'text' });
        return response.data;
    }
    async downloadFile(fileId) {
        if (this.isMock || !this.drive)
            return Buffer.from('Mock binary content');
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                alt: 'media'
            }, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        }
        catch (e) {
            console.error(`DriveService: Failed to download file ${fileId}`, e);
            throw e;
        }
    }
    async watchFolder(folderId, webhookUrl) {
        if (this.isMock || !this.drive)
            return { id: 'mock-channel', resourceId: 'mock-resource' };
        const channel = await this.drive.files.watch({
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
    async getFileMetadata(fileId) {
        if (this.isMock || !this.drive) {
            return { id: fileId, name: 'Mock File.pdf', mimeType: 'application/pdf' };
        }
        try {
            const response = await this.drive.files.get({
                fileId: fileId,
                fields: 'id, name, mimeType, webViewLink, modifiedTime, owners'
            });
            return response.data;
        }
        catch (e) {
            console.error(`DriveService: Failed to get metadata for ${fileId}`, e);
            return null;
        }
    }
    async checkPermission(fileId, userEmail) {
        if (this.isMock || !this.drive)
            return true;
        try {
            const response = await this.drive.permissions.list({
                fileId: fileId,
                fields: 'permissions(emailAddress, role)'
            });
            return (response.data.permissions || []).some(p => p.emailAddress === userEmail);
        }
        catch (e) {
            return false;
        }
    }
    async checkHealth() {
        if (this.isMock || !this.drive)
            return { status: 'OK', message: 'Mock Mode' };
        try {
            // Test by listing root folder (just 1 file)
            await this.drive.files.list({ pageSize: 1 });
            return { status: 'OK', message: 'Connected to Google Drive' };
        }
        catch (e) {
            return { status: 'ERROR', message: `Drive Error: ${e.message}` };
        }
    }
}
//# sourceMappingURL=drive.service.js.map