import { drive_v3 } from 'googleapis';
export declare class DriveService {
    private drive;
    private isMock;
    constructor(authKeyPath: string);
    uploadFile(folderId: string, fileName: string, filePath: string, mimeType: string): Promise<string>;
    renameFile(fileId: string, newName: string): Promise<boolean>;
    listFiles(folderId: string): Promise<drive_v3.Schema$File[]>;
    exportDocument(fileId: string, mimeType?: string): Promise<string>;
    downloadFile(fileId: string): Promise<Buffer>;
    watchFolder(folderId: string, webhookUrl: string): Promise<drive_v3.Schema$Channel>;
    getFileMetadata(fileId: string): Promise<drive_v3.Schema$File | null>;
    checkPermission(fileId: string, userEmail: string): Promise<boolean>;
    checkHealth(): Promise<{
        status: 'OK' | 'ERROR';
        message?: string;
    }>;
}
//# sourceMappingURL=drive.service.d.ts.map