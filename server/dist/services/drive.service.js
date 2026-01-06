import { google, drive_v3 } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
export class DriveService {
    drive = null;
    isMock = false;
    constructor(authKeyPath) {
        try {
            const auth = new google.auth.GoogleAuth({
                keyFile: authKeyPath,
                scopes: [
                    'https://www.googleapis.com/auth/drive.readonly',
                    'https://www.googleapis.com/auth/drive.metadata.readonly'
                ]
            });
            this.drive = google.drive({ version: 'v3', auth });
        }
        catch (e) {
            console.warn('DriveService: Failed to initialize Google Drive client (missing key file?). Entering MOCK MODE.');
            this.isMock = true;
        }
    }
    async listFiles(folderId) {
        if (this.isMock || !this.drive) {
            console.log('DriveService: Recurring mock files for listFiles');
            return [
                { id: 'mock-1', name: 'Mock Project Plan.pdf', mimeType: 'application/pdf', modifiedTime: new Date().toISOString() },
                { id: 'mock-2', name: 'Mock Budget 2024.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet', modifiedTime: new Date().toISOString() }
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
}
//# sourceMappingURL=drive.service.js.map