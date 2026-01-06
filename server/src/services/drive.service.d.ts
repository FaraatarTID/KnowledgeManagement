import { drive_v3 } from 'googleapis';
export declare class DriveService {
    private drive;
    private isMock;
    constructor(authKeyPath: string);
    listFiles(folderId: string): Promise<drive_v3.Schema$File[]>;
    exportDocument(fileId: string, mimeType?: string): Promise<string>;
    watchFolder(folderId: string, webhookUrl: string): Promise<drive_v3.Schema$Channel>;
    checkPermission(fileId: string, userEmail: string): Promise<boolean>;
}
//# sourceMappingURL=drive.service.d.ts.map