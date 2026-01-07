import { drive_v3 } from 'googleapis';
export declare class DriveService {
    private drive;
    private isMock;
    constructor(authKeyPath: string);
    uploadFile(folderId: string, fileName: string, filePath: string, mimeType: string): Promise<string>;
    renameFile(fileId: string, newName: string): Promise<boolean>;
    listFiles(folderId: string): Promise<drive_v3.Schema$File[]>;
    exportDocument(fileId: string, mimeType?: string): Promise<string>;
    watchFolder(folderId: string, webhookUrl: string): Promise<drive_v3.Schema$Channel>;
    checkPermission(fileId: string, userEmail: string): Promise<boolean>;
}
//# sourceMappingURL=drive.service.d.ts.map