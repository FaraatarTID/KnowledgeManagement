import { Router } from 'express';
import { RAGService } from '../services/rag.service.js';
import { GeminiService } from '../services/gemini.service.js';
import { VectorService } from '../services/vector.service.js';
import { DriveService } from '../services/drive.service.js';
import { SyncService } from '../services/sync.service.js';
import { HistoryService } from '../services/history.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

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
  
  console.warn('⚠️ WARNING: Missing Environment Variables. Falling back to DEV DEFAULTS.');
  console.warn('⚠️ DO NOT USE IN PRODUCTION!');
  missingVars.forEach(v => console.warn(`   - ${v} (using default)`));
  
  // Set defaults for Dev/Demo mode ONLY
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev-secret-do-not-use-in-prod';
  if (!process.env.GCP_PROJECT_ID) process.env.GCP_PROJECT_ID = 'aikb-mock-project';
}

// Services
const geminiService = new GeminiService(process.env.GCP_PROJECT_ID || 'aikb-mock-project');
const vectorService = new VectorService(process.env.GCP_PROJECT_ID || 'aikb-prod', 'us-central1');
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(process.env.GCP_KEY_FILE || 'key.json');
const syncService = new SyncService(driveService, vectorService, geminiService);
const historyService = new HistoryService();

console.log('✅ API Routes: Registering endpoints...');

// Public Ping
router.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// --- SYNC ROUTE ---
router.post('/sync', authMiddleware, async (req: any, res) => {
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  
  if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
    return res.json({ status: 'skipped', message: 'No Drive Folder Configured (Demo Mode)' });
  }

  try {
    const result = await syncService.syncAll(process.env.GOOGLE_DRIVE_FOLDER_ID);
    res.json(result);
  } catch (e: any) {
    console.error('Sync failed:', e);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// --- MOCK DATABASE (In-Memory for Demo) ---
let MOCK_USERS = [
  { id: 'u1', name: 'Alice Admin', email: 'alice@aikb.com', role: 'ADMIN', department: 'IT', status: 'Active' },
  { id: 'u2', name: 'Bob Manager', email: 'bob@aikb.com', role: 'MANAGER', department: 'Sales', status: 'Active' },
  { id: 'u3', name: 'Charlie Dev', email: 'charlie@aikb.com', role: 'EDITOR', department: 'Engineering', status: 'Active' },
  { id: 'u4', name: 'David User', email: 'david@aikb.com', role: 'VIEWER', department: 'Marketing', status: 'Active' }
];

// --- AUTH ROUTES ---

router.post('/auth/login', (req, res) => {
  const { type } = req.body; // 'admin' or 'user'
  
  // Simulate different login personas
  let user;
  if (type === 'admin') {
    user = MOCK_USERS[0];
  } else {
    user = MOCK_USERS[3];
  }

  if (!user) return res.status(400).json({ error: 'Invalid user type' });
  const token = jwt.sign(user, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
  res.json({ token, user });
});

router.get('/auth/me', authMiddleware, (req: any, res) => {
  // Return the fresh user object from the mock DB based on the token's ID
  const user = MOCK_USERS.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// --- User Management ---

router.get('/users', authMiddleware, (req: any, res) => {
  // SECURITY: Restrict user listing to admins and managers only
  if (!['ADMIN', 'MANAGER'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied. Admin or Manager role required.' });
  }
  res.json(MOCK_USERS);
});

// History / Activity Log (Admin/Manager only)
router.get('/history', authMiddleware, async (req: any, res: any) => {
  console.log(`[API] GET /history called by ${req.user?.email} (${req.user?.role})`);
  if (req.user.role !== 'ADMIN' && req.user.role !== 'MANAGER') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const history = await historyService.getHistory();
  res.json(history);
});

router.patch('/users/:id', authMiddleware, (req: any, res) => {
  // SECURITY: Only ADMIN can modify user roles
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Admin role required to modify users.' });
  }
  
  const { id } = req.params;
  const { role, status } = req.body;
  
  // Validate role value if provided
  const validRoles = ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
  }
  
  const userIndex = MOCK_USERS.findIndex(u => u.id === id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  const user = MOCK_USERS[userIndex];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updatedUser = { ...user, role: role || user.role, status: status || user.status };
  MOCK_USERS[userIndex] = updatedUser;
  res.json(updatedUser);
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

router.get('/documents', authMiddleware, async (req: any, res) => {
  try {
    const user = req.user;
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
       // Fallback to mock docs if no Drive configured for demo
       const mockDocs = [
         { id: 'd1', name: 'Security Policy 2024', category: 'Compliance', department: 'IT', sensitivity: 'CONFIDENTIAL', status: 'Synced', date: new Date(), owner: 'alice@aikb.com' },
         { id: 'd2', name: 'Product Specs v2', category: 'Engineering', department: 'Engineering', sensitivity: 'INTERNAL', status: 'Synced', date: new Date(), owner: 'charlie@aikb.com' }
       ];
       // Filter by department for non-admins
       if (user.role === 'ADMIN') return res.json(mockDocs);
       return res.json(mockDocs.filter(d => d.department === user.department));
    }
    const files = await driveService.listFiles(process.env.GOOGLE_DRIVE_FOLDER_ID);
    
    const documents = files.map(f => ({
      id: f.id,
      name: f.name,
      category: f.mimeType?.includes('folder') ? 'Folder' : 'Document',
      department: (f as any).department || 'General', // Would be derived from Drive Metadata/Path
      sensitivity: 'INTERNAL', 
      status: 'Synced',
      date: f.modifiedTime,
      owner: f.owners?.[0]?.emailAddress
    }));

    // Filter by department for non-admins
    if (user.role === 'ADMIN') return res.json(documents);
    res.json(documents.filter(d => !d.department || d.department === user.department || d.department === 'General'));

  } catch (error: any) {
    console.error('Drive listing error:', error);
    res.json([]);
  }
});

router.get('/stats', authMiddleware, async (req, res) => {
  res.json({
    totalDocuments: 1248,
    activeUsers: MOCK_USERS.length,
    aiResolution: '92%',
    systemHealth: 'Optimal'
  });
});

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'aikb-api' });
});

export default router;
