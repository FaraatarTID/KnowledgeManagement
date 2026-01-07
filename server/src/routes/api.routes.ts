import { Router } from 'express';
import { RAGService } from '../services/rag.service.js';
import { GeminiService } from '../services/gemini.service.js';
import { VectorService } from '../services/vector.service.js';
import { DriveService } from '../services/drive.service.js';
import { SyncService } from '../services/sync.service.js';
import { HistoryService } from '../services/history.service.js';
import { ConfigService } from '../services/config.service.js';
import { AuthService } from '../services/auth.service.js';
import { UserService } from '../services/user.service.js';
import { AuditService } from '../services/access.service.js';
import { authMiddleware, requireRole } from '../middleware/auth.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

import crypto from 'crypto';

const router = Router();



// --- SERVER STARTUP VALIDATION ---
const REQUIRED_ENV_VARS = ['GCP_PROJECT_ID', 'JWT_SECRET'];
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  // SECURITY: Fail fast in production if critical env vars are missing
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Missing required environment variables in production:', missingVars);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  console.warn('⚠️ WARNING: Missing Environment Variables.');
  missingVars.forEach(v => console.warn(`   - ${v}`));
  
  // SECURITY: JWT_SECRET is ALWAYS required - use a generated default for dev only
  if (!process.env.JWT_SECRET) {
    // Generate a random secret for development (logged for debugging)
    const devSecret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = devSecret;
    console.warn('⚠️ Generated temporary JWT_SECRET for dev session. Set JWT_SECRET env var for persistence.');
  }
  if (!process.env.GCP_PROJECT_ID) process.env.GCP_PROJECT_ID = 'aikb-mock-project';
}

// SECURITY: Prevent mock project leak in production
if (process.env.NODE_ENV === 'production' && process.env.GCP_PROJECT_ID === 'aikb-mock-project') {
  console.error('❌ FATAL: Using "aikb-mock-project" in production is not allowed.');
  throw new Error('Invalid GCP_PROJECT_ID for production environment.');
}

// --- MULTER SETUP (Manual Uploads) ---
// SECURITY: File upload validation
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'data', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use crypto for secure random filename
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: PDF, Word, Excel, Text, Markdown`));
    }
  }
});

// Services
const geminiService = new GeminiService(process.env.GCP_PROJECT_ID || 'aikb-mock-project');
const vectorService = new VectorService(process.env.GCP_PROJECT_ID || 'aikb-prod', 'us-central1');
const auditService = new AuditService();
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(process.env.GCP_KEY_FILE || 'key.json');
const syncService = new SyncService(driveService, vectorService, geminiService);
const historyService = new HistoryService();
const configService = new ConfigService();
const authService = new AuthService();
const userService = new UserService();

console.log('✅ API Routes: Registering endpoints...');

// SECURITY / RELIABILITY: Graceful Shutdown
const shutdown = async () => {
  console.log('\n--- SHUTDOWN INITIATED ---');
  try {
    await vectorService.flush();
    console.log('✅ All data synced to disk.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Error during shutdown:', e);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Public Ping
router.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

router.post('/upload', authMiddleware, requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req: any, res) => {
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
});

// --- CONFIG ROUTES ---

router.get('/config', authMiddleware, (req: any, res) => {
  res.json(configService.getConfig());
});

router.patch('/config/categories', authMiddleware, (req: any, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: 'Invalid categories format' });
  configService.updateCategories(categories);
  res.json({ success: true, categories: configService.getConfig().categories });
});

router.patch('/config/departments', authMiddleware, (req: any, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  const { departments } = req.body;
  if (!Array.isArray(departments)) return res.status(400).json({ error: 'Invalid departments format' });
  configService.updateDepartments(departments);
  res.json({ success: true, departments: configService.getConfig().departments });
});

// --- SYNC ROUTE ---
router.post('/sync', authMiddleware, async (req: any, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  
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
});

// --- CHAT ROUTES ---

router.post('/chat', authMiddleware, async (req: any, res) => {
  const { message, history } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const user = req.user;
    const result = await ragService.query({
      query: message,
      userId: user.id,
      userProfile: {
        name: user.name,
        department: user.department,
        role: user.role
      },
      history
    });

    res.json(result);
  } catch (error) {
    console.error('Chat API Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- AUTH ROUTES ---

// Login validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  // Legacy support: also accept 'type' for demo mode only
  type: z.enum(['admin', 'user']).optional()
});

router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    
    // Legacy demo mode support (when email/password not provided)
    if (req.body.type && !req.body.email) {
      // Demo mode: use predefined credentials
      const demoEmail = req.body.type === 'admin' ? 'alice@aikb.com' : 'david@aikb.com';
      const demoPassword = 'admin123';
      
      const user = await authService.validateCredentials(demoEmail, demoPassword);
      if (!user) {
        return res.status(401).json({ error: 'Demo credentials failed' });
      }
      
      const token = authService.generateToken(user);
      
      // Set httpOnly cookie
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      // Also return token in body for backward compatibility
      return res.json({ token, user });
    }
    
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid credentials format',
        details: parsed.error.issues.map(i => i.message)
      });
    }
    
    const { email, password } = parsed.data;
    
    const user = await authService.validateCredentials(email, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = authService.generateToken(user);
    
    // Set httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({ token, user });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

router.get('/auth/me', authMiddleware, async (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  
  // Get fresh user data from service
  const user = await authService.getUserById(req.user?.id || '');
  if (!user) return res.status(404).json({ error: 'User not found' });
  
  res.json(user);
});

// --- User Management ---

router.get('/users', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  const users = await userService.getAll();
  res.json(users);
});

router.post('/users', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  try {
    const { email, password, name, role, department } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password and name are required' });
    }

    // Check if user already exists
    const existing = await userService.getByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const newUser = await userService.create({
      email,
      password,
      name,
      role: role || 'VIEWER',
      department: department || 'General'
    });

    if (!newUser) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    res.status(201).json(newUser);
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// History / Activity Log (Admin/Manager only)
router.get('/history', authMiddleware, requireRole('ADMIN', 'MANAGER'), async (req: AuthRequest, res) => {
  console.log(`[API] GET /history called by ${req.user?.email} (${req.user?.role})`);
  const history = await historyService.getHistory();
  res.json(history);
});

router.patch('/users/:id', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { role, status, department } = req.body;
  
  // Validate role value if provided
  const validRoles = ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }
  
  const updatedUser = await userService.update(id as string, { role, status, department });
  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json(updatedUser);
});

router.delete('/users/:id', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'User ID is required' });
  
  const success = await userService.delete(id);
  if (!success) {
    return res.status(404).json({ error: 'User not found or deletion failed' });
  }
  res.json({ success: true, message: 'User deleted successfully' });
});

router.patch('/users/:id/password', authMiddleware, requireRole('ADMIN'), async (req: AuthRequest, res) => {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'User ID is required' });

  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'New password is required' });
  }
  const success = await userService.updatePassword(id, password);
  if (!success) {
    return res.status(404).json({ error: 'User not found or update failed' });
  }
  res.json({ success: true, message: 'Password updated successfully' });
});

// --- RAG & CHAT ROUTES ---

// Input validation schema
const querySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(2000, 'Query too long (max 2000 chars)')
});

router.post('/query', authMiddleware, async (req: any, res) => {
  try {
    // SECURITY: Validate input with Zod
    const parsed = querySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: 'Invalid query', 
        details: parsed.error.issues.map(i => i.message)
      });
    }
    
    const { query } = parsed.data;
    const user = req.user;

    const result = await ragService.query({
      query,
      userId: user.id || 'anonymous',
      userProfile: {
        name: user.name || 'User',
        department: user.department || 'General',
        role: user.role || 'IC'
      }
    });

    res.json(result);
  } catch (error: any) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Failed to process query' });
  }
});

// --- ADMIN & DOCUMENT ROUTES ---

router.delete('/documents/:id', authMiddleware, async (req: any, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  try {
    const { id } = req.params;
    await vectorService.deleteDocument(id);
    res.json({ status: 'success', message: `Document ${id} removed from index.` });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete index' });
  }
});

router.patch('/documents/:id', authMiddleware, async (req: any, res) => {
  // SECURITY: Only ADMIN and MANAGER can modify document metadata
  if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Admin or Manager role required.' });
  }

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
});

router.get('/documents', authMiddleware, async (req: any, res) => {
  try {
    const user = req.user;
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
    
    // For manual uploads, we might not use Google Drive, so we should check vector metadata first
    // This logic needs to be robust for hybrid storage (Drive + Local)
    
    // If Drive is configured:
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
    
    // Also include manually uploaded files that might not be in the main Drive folder yet but are in vector store
    // (Implementation specific: this depends on how we track manual uploads vs syncs)
    
    // Filter by department for non-admins
    if (user.role === 'ADMIN') return res.json(documents);
    res.json(documents.filter(d => !d.department || d.department === user.department || d.department === 'General'));

  } catch (error: any) {
    console.error('Drive listing error:', error);
    res.json([]);
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [users, vectorMeta, vectorHealth, geminiHealth, driveHealth, userHealth, resStats] = await Promise.all([
      userService.getAll(),
      vectorService.getAllMetadata(),
      vectorService.checkHealth(),
      geminiService.checkHealth(),
      driveService.checkHealth(),
      userService.checkHealth(),
      auditService.getResolutionStats()
    ]);

    const docCount = Object.keys(vectorMeta).length;
    
    // Aggregate health status
    const healthChecks = [vectorHealth, geminiHealth, driveHealth, userHealth];
    const errors = healthChecks.filter(h => h.status === 'ERROR');
    
    let systemHealth = 'Optimal';
    if (errors.length > 0) {
      systemHealth = 'Critical'; // Any error is critical for now
    } else if (healthChecks.some(h => h.message?.includes('Mock'))) {
      systemHealth = 'Warning'; // Mock mode is a warning (demo only)
    }

    res.json({
      totalDocuments: docCount,
      activeUsers: users.length,
      aiResolution: resStats.percentage,
      systemHealth,
      details: {
        vector: vectorHealth,
        gemini: geminiHealth,
        drive: driveHealth,
        identity: userHealth
      }
    });
  } catch (error) {
    console.error('Stats aggregation failed', error);
    res.status(500).json({ error: 'Failed to aggregate system stats' });
  }
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'aikb-api' });
});

// Redundant /history route removed (already defined with requireRole at line 402)

router.post('/documents/:id/sync', authMiddleware, async (req: any, res) => {
  const { id } = req.params;
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });

  try {
    // 1. Get file metadata from Drive
    const file = await driveService.getFileMetadata(id);
    if (!file) {
      return res.status(404).json({ error: 'Source file not found in Google Drive' });
    }

    // 2. Trigger targeted indexing
    await syncService.indexFile({
      id: file.id || '',
      name: file.name || 'document',
      mimeType: file.mimeType as string,
      modifiedTime: file.modifiedTime as string
    });

    // 3. Record in History
    await historyService.recordEvent({
      event_type: 'UPDATED',
      doc_id: file.id!,
      doc_name: file.name!,
      details: 'Targeted sync/re-indexing completed.'
    });

    res.json({ success: true, message: `Re-indexed document: ${file.name}` });
  } catch (e: any) {
    console.error(`Targeted sync failed for ${id}:`, e);
    res.status(500).json({ error: 'Failed to re-index document' });
  }
});

export default router;
