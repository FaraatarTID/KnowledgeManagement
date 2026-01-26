import { Request, Response } from 'express';
import fs from 'fs';
import { 
  driveService, 
  vectorService, 
  syncService, 
  historyService 
  // userService is not needed here based on previous code
} from '../container.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

export class DocumentController {
  
  static async upload(req: AuthRequest, res: Response) {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { category, department, title } = req.body;
    const docId = `manual-${Date.now()}`;
    const fileName = title || req.file.originalname;

    try {
      // 0. Upload to Google Drive
      const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      let driveFileId = docId;
      // We'll assume the sync service or a separate call gets the link, 
      // or we can live with # for manual until next sync.

      if (driveFolderId && driveFolderId !== 'mock-folder') {
        driveFileId = await driveService.uploadFile(
          driveFolderId,
          fileName,
          req.file.path,
          req.file.mimetype
        );
      }

      // 1. Persist Metadata Overrides (Stability Feature)
      await vectorService.updateDocumentMetadata(driveFileId, {
        title: fileName,
        category: category || 'General',
        department: department || 'General',
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

      res.json({ 
        success: true, 
        message: 'File uploaded, saved to Drive, and indexed successfully',
        docId: driveFileId,
        file: {
          filename: req.file.filename,
          mimetype: req.file.mimetype,
          size: req.file.size
        }
      });
    } catch (e) {
      console.error('Upload processing failed:', e);
      res.status(500).json({ error: 'Failed to process uploaded file' });
    } finally {
      // Cleanup local file
      if (req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const user = req.user!;
      const vectorMetadata = await vectorService.getAllMetadata();

      if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
         // Fallback to mock docs if no Drive configured for demo
          const mockDocs = [
            { id: 'mock-1', name: 'Mock Project Plan.pdf', category: 'Compliance', department: 'IT', sensitivity: 'CONFIDENTIAL', status: 'Synced', date: new Date(), owner: 'alice@aikb.com', link: 'https://docs.google.com/document/d/mock-1' },
            { id: 'mock-2', name: 'Mock Budget 2024.xlsx', category: 'Engineering', department: 'Engineering', sensitivity: 'INTERNAL', status: 'Synced', date: new Date(), owner: 'charlie@aikb.com', link: 'https://docs.google.com/spreadsheets/d/mock-2' }
          ];
          
          // Merge with vector metadata if exists
          const mergedMock = mockDocs.map(d => ({
            ...d,
            name: vectorMetadata[d.id]?.title || d.name,
            category: vectorMetadata[d.id]?.category || d.category,
            sensitivity: vectorMetadata[d.id]?.sensitivity || d.sensitivity,
            link: vectorMetadata[d.id]?.link || d.link
          }));

         // Filter by department for non-admins
         if (user.role === 'ADMIN') return res.json(mergedMock);
         return res.json(mergedMock.filter(d => d.department === user.department));
      }
      
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
           console.error('Drive listing failed, falling back to local metadata', e);
         }
      }
      
      // Map sensitivity and roles to numeric levels for filtering
      const sensitivityMap: Record<string, number> = { 'PUBLIC': 0, 'INTERNAL': 1, 'CONFIDENTIAL': 2, 'RESTRICTED': 3, 'EXECUTIVE': 4 };
      const roleMap: Record<string, number> = { 'VIEWER': 1, 'EDITOR': 2, 'MANAGER': 3, 'ADMIN': 4 };
      const userClearance = roleMap[user.role.toUpperCase()] || 1;

      // Filter by department AND sensitivity for non-admins
      if (user.role === 'ADMIN') return res.json(documents);
      
      res.json(documents.filter(d => {
         const docSensitivity = (d.sensitivity || 'INTERNAL').toUpperCase();
         const docLevel = sensitivityMap[docSensitivity] ?? 1;
         
         // Sensitivity check
         if (userClearance < docLevel) return false;
         
         // Department check
         return !d.department || d.department === user.department || d.department === 'General';
      }));

    } catch (error: any) {
      console.error('Drive listing error:', error);
      res.json([]);
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, category, sensitivity, department } = req.body;

      // Validate metadata
      if (!title && !category && !sensitivity && !department) {
        return res.status(400).json({ error: 'At least one metadata field (title, category, sensitivity or department) must be provided.' });
      }

      // 1. Update local index (VectorStore + Metadata Overrides)
      await vectorService.updateDocumentMetadata(id, { title, category, sensitivity, department });
      
      // 2. Attempt to Push Rename to Google Drive (Best Effort / Hybrid)
      let driveRenameStatus = 'skipped';
      if (title) {
         const success = await driveService.renameFile(id, title);
         driveRenameStatus = success ? 'success' : 'failed';
      }

      // 3. Record in history
      await historyService.recordEvent({
        event_type: 'UPDATED',
        doc_id: id,
        doc_name: title || 'Metadata Update',
        details: `Metadata updated: ${JSON.stringify({ title, category, sensitivity, department })}. Drive Rename: ${driveRenameStatus}`
      });

      res.json({ 
        status: 'success', 
        message: `Document ${id} updated.`,
        driveRename: driveRenameStatus 
      });
    } catch (e) {
      console.error('Failed to update document metadata:', e);
      res.status(500).json({ error: 'Failed to update metadata' });
    }
  }

  static async delete(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      await vectorService.deleteDocument(id);
      res.json({ status: 'success', message: `Document ${id} removed from index.` });
    } catch (e) {
      res.status(500).json({ error: 'Failed to delete index' });
    }
  }

  static async syncOne(req: AuthRequest, res: Response) {
    const { id } = req.params;
    try {
      // 1. Get file metadata from Drive
      const file = await driveService.getFileMetadata(id);
      if (!file) {
          return res.status(404).json({error: 'File not found on Drive'});
      }
      
      // 2. Index
      await syncService.indexFile({
          id: file.id || id,
          name: file.name || 'Untitled',
          mimeType: file.mimeType || 'application/octet-stream',
          modifiedTime: file.modifiedTime || new Date().toISOString()
      });

      res.json({ status: 'success', message: `Document ${id} synced.` });
    } catch(e) {
        console.error('Sync error:', e);
        res.status(500).json({error: 'Sync failed'});
    }
  }

  static async syncAll(req: AuthRequest, res: Response) {
    try {
      if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
        // Record mock sync event
        await historyService.recordEvent({
          event_type: 'UPDATED',
          doc_id: 'internal-sync',
          doc_name: 'System Sync',
          details: 'Simulated sync completed successfully in mock mode.'
        });
        return res.json({ status: 'success', message: 'Demo Sync Completed (Mock Mode)' });
      }
  
      const result = await syncService.syncAll(process.env.GOOGLE_DRIVE_FOLDER_ID);
      
      // Record in History
      await historyService.recordEvent({
        event_type: 'UPDATED',
        doc_id: 'global-sync',
        doc_name: 'Knowledge Base Sync',
        details: `Full cloud sync completed. Results: ${JSON.stringify(result)}`
      });
  
      res.json(result);
    } catch (e: any) {
      console.error('Sync failed:', e);
      res.status(500).json({ error: 'Sync failed' });
    }
  }
}
