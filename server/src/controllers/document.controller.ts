import type { Response, RequestHandler } from 'express';
import fs from 'fs';
import { 
  driveService, 
  vectorService, 
  syncService, 
  historyService 
} from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { Logger } from '../utils/logger.js';
import { AppError } from '../middleware/error.middleware.js';
import { catchAsync } from '../utils/catchAsync.js';

export class DocumentController {
  
  static upload: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const { category, department, title } = req.body;
    const docId = `manual-${Date.now()}`;
    const fileName = title || req.file.originalname;

    Logger.info('Starting document upload', { fileName, size: req.file.size, user: req.user?.email });

    try {
      // 0. Upload to Google Drive
      const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      let driveFileId = docId;

      if (driveFolderId && driveFolderId !== 'mock-folder') {
        driveFileId = await driveService.uploadFile(
          driveFolderId,
          fileName,
          req.file.path,
          req.file.mimetype
        );
      }

      // 1. Persist Metadata Overrides (Stability Feature)
      // SECURITY: Default to user's department to prevent 'General' leakage
      const finalDepartment = department || req.user?.department || 'General';
      
      await vectorService.updateDocumentMetadata(driveFileId, {
        title: fileName,
        category: category || 'General',
        department: finalDepartment,
        sensitivity: 'INTERNAL',
      });

      // 2. Immediate AI Indexing
      await syncService.indexFile({
        id: driveFileId,
        name: fileName,
        mimeType: req.file.mimetype,
        modifiedTime: new Date().toISOString()
      });

      // 3. Record in History
      await historyService.recordEvent({
        event_type: 'CREATED',
        doc_id: driveFileId,
        doc_name: fileName,
        details: `Manually uploaded & indexed: ${department || 'General'}/${category || 'General'}`
      });

      Logger.info('Document upload complete', { docId: driveFileId });

      res.json({ 
        success: true, 
        message: 'File uploaded and indexed successfully',
        docId: driveFileId,
        file: {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size
        }
      });
    } finally {
      // Cleanup local file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  });

  static list: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    const vectorMetadata = await vectorService.getAllMetadata();

    let documents: any[] = [];
    
    if (process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_DRIVE_FOLDER_ID !== 'mock-folder') {
        try {
          const files = await driveService.listFiles(process.env.GOOGLE_DRIVE_FOLDER_ID);
          documents = files.map(f => {
            const vMeta = vectorMetadata[f.id!] || {};
            const link = vMeta.link || f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
          
          return {
            id: f.id,
            name: vMeta.title || f.name,
            mimeType: f.mimeType,
            modifiedAt: f.modifiedTime,
            category: vMeta.category || 'General',
            sensitivity: vMeta.sensitivity || 'INTERNAL',
            department: vMeta.department || 'General',
            owner: vMeta.owner || (f.owners?.[0] as any)?.emailAddress,
            link: link,
            status: vectorMetadata[f.id!] ? 'Synced' : 'Not Synced'
          };
        });
        } catch (e) {
          Logger.error('Drive listing failed', { error: (e as any).message });
          // Fallback to empty list or local metadata only
        }
    }
    
    const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
    const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
    const userClearance = roleMap[user.role.toUpperCase()] || 1;

    if (user.role === 'ADMIN') return res.json(documents);
    
    res.json(documents.filter(d => {
        const docSensitivity = (d.sensitivity || 'INTERNAL').toUpperCase();
        const docLevel = sensitivityMap[docSensitivity] ?? 1;
        
        if (userClearance < docLevel) return false;
        return !d.department || d.department === user.department || d.department === 'General';
    }));
  });

  static update: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { title, category, sensitivity, department } = req.body;
    const user = req.user!;

    if (!title && !category && !sensitivity && !department) {
      throw new AppError('At least one metadata field must be provided', 400);
    }

    if (!id) throw new AppError('Document ID is required', 400);
    
    const allMetadata = await vectorService.getAllMetadata();
    const docMeta = allMetadata[id];
    
    if (!docMeta) throw new AppError('Document not found', 404);

    const isOwner = docMeta.owner && docMeta.owner.toLowerCase() === user.email.toLowerCase();
    const isPrivileged = user.role === 'ADMIN' || user.role === 'MANAGER';
    
    if (!isOwner && !isPrivileged) {
      Logger.warn('Unauthorized update attempt', { docId: id, user: user.email });
      throw new AppError('Permission denied', 403);
    }

    await vectorService.updateDocumentMetadata(id, { title, category, sensitivity, department });
    
    let driveRenameStatus = 'skipped';
    if (title) {
        const success = await driveService.renameFile(id, title);
        driveRenameStatus = success ? 'success' : 'failed';
    }

    await historyService.recordEvent({
      event_type: 'UPDATED',
      doc_id: id,
      doc_name: title || 'Metadata Update',
      details: `Metadata updated by ${user.email}. Drive Rename: ${driveRenameStatus}`
    });

    Logger.info('Document metadata updated', { docId: id, changes: { title, category, sensitivity, department } });

    res.json({ 
      status: 'success', 
      message: `Document ${id} updated.`,
      driveRename: driveRenameStatus 
    });
  });

  static delete: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    if (!id) throw new AppError('ID required', 400);
    await vectorService.deleteDocument(id);
    Logger.info('Document deleted from index', { docId: id });
    res.json({ status: 'success', message: `Document ${id} removed from index.` });
  });

  static syncOne: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    if (!id) throw new AppError('ID required', 400);

    const file = await driveService.getFileMetadata(id);
    if (!file) throw new AppError('File not found on Drive', 404);
    
    await syncService.indexFile({
        id: file.id || id,
        name: file.name || 'Untitled',
        mimeType: file.mimeType || 'application/octet-stream',
        modifiedTime: file.modifiedTime || new Date().toISOString()
    });

    Logger.info('Single file sync completed', { docId: id });
    res.json({ status: 'success', message: `Document ${id} synced.` });
  });

  static syncAll: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID === 'mock-folder') {
      throw new AppError('Google Drive folder ID is not configured. Sync cannot proceed.', 400);
    }

    Logger.info('Starting full sync');
    const result = await syncService.syncAll(process.env.GOOGLE_DRIVE_FOLDER_ID);
    
    await historyService.recordEvent({
      event_type: 'UPDATED',
      doc_id: 'global-sync',
      doc_name: 'Knowledge Base Sync',
      details: `Full cloud sync completed. Processed: ${result.processed}`
    });

    Logger.info('Full sync completed', { result });
    res.json(result);
  });
}

