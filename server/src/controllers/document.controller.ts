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
import { executeSaga } from '../utils/saga-transaction.js';

export class DocumentController {
  private static toCanonicalDocumentId(id: string): string {
    const normalizedId = id.trim();
    const chunkMatch = normalizedId.match(/^(.*?)(?:_chunk\d+|_\d+)$/);
    return chunkMatch?.[1] || normalizedId;
  }

  private static isDriveConfigured(): boolean {
    return !!process.env.GOOGLE_DRIVE_FOLDER_ID;
  }
  
  static upload: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const { category, department, title } = req.body;
    const fileName = title || req.file.originalname;

    Logger.info('Starting document upload', { fileName, size: req.file.size, user: req.user?.email });

    // Use saga pattern to ensure consistency: if any step fails, rollback all
    const result = await executeSaga('document_upload', async (saga) => {
      const docId = `manual-${Date.now()}`;

      try {
        // STEP 1: Upload to Google Drive
        let driveFileId = docId;
        const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

        if (driveFolderId) {
          driveFileId = await driveService.uploadFile(
            driveFolderId,
            fileName,
            req.file!.path,
            req.file!.mimetype
          );
          saga.addStep('drive_upload', driveFileId);
          
          // Compensation: Delete from Drive if later steps fail
          saga.addCompensation('drive_upload', async () => {
            try {
              await driveService.deleteFile(driveFileId);
              Logger.info('Compensation: Deleted orphaned Drive file', { driveFileId });
            } catch (e) {
              Logger.warn('Compensation: Could not delete Drive file', { driveFileId, error: e });
            }
          });
        }

        // STEP 2: Persist Metadata Overrides
        const finalDepartment = department || req.user?.department || 'General';
        const source = driveFolderId ? 'drive' : 'local';
        
        await vectorService.updateDocumentMetadata(driveFileId, {
          title: fileName,
          category: category || 'General',
          department: finalDepartment,
          sensitivity: 'INTERNAL',
        });
        saga.addStep('metadata_persisted', { driveFileId });

        // STEP 3: Index for AI (best-effort)
        let indexingStatus: 'indexed' | 'pending' = 'indexed';
        let indexingError: string | undefined;

        try {
          await syncService.indexFile({
            id: driveFileId,
            name: fileName,
            mimeType: req.file!.mimetype,
            modifiedTime: new Date().toISOString()
          }, undefined, !driveFolderId ? { localFilePath: req.file!.path } : undefined);
          saga.addStep('ai_indexed', { driveFileId });
        } catch (indexError: any) {
          indexingStatus = 'pending';
          indexingError = indexError?.message || 'unknown indexing error';

          Logger.warn('Upload completed but AI indexing failed; keeping document metadata', {
            docId: driveFileId,
            error: indexingError
          });
        }

        // STEP 4: Record in History
        await historyService.recordEvent({
          event_type: 'CREATED',
          doc_id: driveFileId,
          doc_name: fileName,
          details: indexingStatus === 'indexed'
            ? `Uploaded & indexed (${source}): ${finalDepartment}/${category || 'General'}`
            : `Uploaded (index pending, ${source}): ${finalDepartment}/${category || 'General'}. Reason: ${indexingError}`
        });
        saga.addStep('history_recorded', { driveFileId, indexingStatus });

        Logger.info('Document upload complete', { docId: driveFileId, indexingStatus });

        return {
          success: true,
          message: indexingStatus === 'indexed'
            ? 'File uploaded and indexed successfully'
            : 'File uploaded successfully. AI indexing is currently unavailable and will need retry.',
          indexingStatus,
          docId: driveFileId,
          file: {
            filename: req.file!.filename,
            mimetype: req.file!.mimetype,
            size: req.file!.size
          }
        };
      } finally {
        // Cleanup local file (always, whether saga succeeded or failed)
        if (req.file!.path && fs.existsSync(req.file!.path)) {
          fs.unlinkSync(req.file!.path);
        }
      }
    });

    res.json(result);
  });

  static list: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const user = req.user!;
    
    // FIXED: Query Vector DB with RBAC filters applied at retrieval time (O(1) with index)
    // Instead of fetching all docs then filtering (O(n²)), let vector DB handle filtering
    try {
      const documents = await vectorService.listDocumentsWithRBAC({
        userId: user.id,
        department: user.department,
        role: user.role,
        // Let Vertex AI apply filters BEFORE returning results
      });

      // For admin, return all documents without filtering
      if (user.role === 'ADMIN') {
        return res.json(documents);
      }

      // For non-admins, documents are already filtered by vector DB
      // This is O(log n) because Vertex AI uses indexes
      res.json(documents);
    } catch (e) {
      Logger.error('Document listing failed', { error: (e as any).message });
      res.json([]);  // Fallback to empty list
    }
  });

  static update: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const canonicalId = id ? DocumentController.toCanonicalDocumentId(id) : id;
    const { title, category, sensitivity, department } = req.body;
    const user = req.user!;

    if (!title && !category && !sensitivity && !department) {
      throw new AppError('At least one metadata field must be provided', 400);
    }

    if (!canonicalId) throw new AppError('Document ID is required', 400);
    
    const allMetadata = await vectorService.getAllMetadata();
    const docMeta = allMetadata[canonicalId];
    
    if (!docMeta) throw new AppError('Document not found', 404);

    const isOwner = docMeta.owner && docMeta.owner.toLowerCase() === user.email.toLowerCase();
    const isPrivileged = user.role === 'ADMIN' || user.role === 'MANAGER';
    
    if (!isOwner && !isPrivileged) {
      Logger.warn('Unauthorized update attempt', { docId: canonicalId, user: user.email });
      throw new AppError('Permission denied', 403);
    }

    await vectorService.updateDocumentMetadata(canonicalId, { title, category, sensitivity, department });
    
    const isManualDocument = canonicalId.startsWith('manual-');
    let driveRenameStatus = 'skipped';
    if (title && isManualDocument) {
      driveRenameStatus = 'not_applicable';
    } else if (title && !DocumentController.isDriveConfigured()) {
      driveRenameStatus = 'not_configured';
    } else if (title && DocumentController.isDriveConfigured()) {
      const success = await driveService.renameFile(canonicalId, title);
      driveRenameStatus = success ? 'success' : 'failed';
    }

    await historyService.recordEvent({
      event_type: 'UPDATED',
      doc_id: canonicalId,
      doc_name: title || 'Metadata Update',
      details: `Metadata updated by ${user.email}. Drive Rename: ${driveRenameStatus}`
    });

    Logger.info('Document metadata updated', { docId: canonicalId, changes: { title, category, sensitivity, department } });

    res.json({ 
      status: 'success', 
      message: `Document ${canonicalId} updated.`,
      driveRename: driveRenameStatus 
    });
  });

  static delete: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const canonicalId = id ? DocumentController.toCanonicalDocumentId(id) : id;
    if (!canonicalId) throw new AppError('ID required', 400);
    const userEmail = req.user?.email || 'unknown';
    const isManualDocument = canonicalId.startsWith('manual-');

    // For synced Google Drive docs, delete source file first.
    // If this fails, fail fast instead of pretending deletion succeeded.
    if (!isManualDocument && DocumentController.isDriveConfigured()) {
      try {
        await driveService.deleteFile(canonicalId);
      } catch (error: any) {
        await historyService.recordEvent({
          event_type: 'DELETE_FAILED',
          doc_id: canonicalId,
          doc_name: canonicalId,
          details: `Delete requested by ${userEmail}. Drive delete failed: ${error?.message || 'unknown error'}`
        });

        Logger.warn('Failed to delete source file from Google Drive; aborting delete to avoid re-import', {
          docId: canonicalId,
          error: error?.message
        });
        throw new AppError(`Unable to delete source file from Google Drive: ${error?.message || 'unknown error'}`, 502);
      }
    }

    await vectorService.deleteDocument(canonicalId);

    // FIXED: Invalidate cache for this document and related searches
    // Emit event so VectorService clears its cache
    const { cacheInvalidation } = await import('../utils/cache-invalidation.js');
    await cacheInvalidation.deleteDocument(canonicalId);

    await historyService.recordEvent({
      event_type: 'DELETED',
      doc_id: canonicalId,
      doc_name: canonicalId,
      details: `Deleted by ${userEmail}. Source: ${isManualDocument || !DocumentController.isDriveConfigured() ? 'local/manual' : 'google-drive'}`
    });

    Logger.info('Document deleted from storage/index and cache invalidated', { docId: canonicalId });
    res.json({ status: 'success', message: `Document ${canonicalId} removed.` });
  });

  static syncOne: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const canonicalId = id ? DocumentController.toCanonicalDocumentId(id) : id;
    if (!canonicalId) throw new AppError('ID required', 400);

    if (!DocumentController.isDriveConfigured()) {
      throw new AppError('Google Drive is not configured for sync operations.', 503);
    }

    const file = await driveService.getFileMetadata(canonicalId);
    if (!file) throw new AppError('File not found on Drive', 404);
    
    await syncService.indexFile({
        id: file.id || canonicalId,
        name: file.name || 'Untitled',
        mimeType: file.mimeType || 'application/octet-stream',
        modifiedTime: file.modifiedTime || new Date().toISOString()
    });

    Logger.info('Single file sync completed', { docId: canonicalId });
    res.json({ status: 'success', message: `Document ${canonicalId} synced.` });
  });

  static syncAll: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    if (!folderId) {
      Logger.info('Sync requested but Google Drive is not configured; skipping full sync');
      return res.json({ status: 'skipped', processed: 0, message: 'Google Drive is not configured. Full sync skipped.' });
    }

    Logger.info('Starting full sync');

    try {
      const result = await syncService.syncAll(folderId);

      await historyService.recordEvent({
        event_type: 'UPDATED',
        doc_id: 'global-sync',
        doc_name: 'Knowledge Base Sync',
        details: `Full cloud sync completed. Processed: ${result.processed}`
      });

      Logger.info('Full sync completed', { result });
      return res.json({ ...result, message: 'Sync complete' });
    } catch (error: any) {
      Logger.warn('Full sync failed; returning user-friendly operational error', {
        error: error?.message,
        code: error?.code
      });
      throw new AppError(`Sync failed: ${error?.message || 'Google Drive connection problem'}`, 503);
    }
  });

  static syncBatch: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
    const { documents } = req.body;
    if (!Array.isArray(documents)) throw new AppError('Documents array is required', 400);

    Logger.info('Batch sync requested', { count: documents.length });
    let successes = 0;
    let failures = 0;

    for (const doc of documents) {
      try {
        await syncService.indexContent({
          id: doc.id || `local-${Date.now()}`,
          name: doc.title || 'Untitled',
          content: doc.content || '',
          metadata: {
            category: doc.category || 'General',
            department: doc.department || req.user?.department || 'General',
            sensitivity: doc.sensitivity || 'INTERNAL'
          }
        });
        successes++;
      } catch (err) {
        Logger.error('Batch sync item failed', { id: doc.id, error: (err as any).message });
        failures++;
      }
    }

    res.json({
      stats: { successes, failures }
    });
  });
}
