import { Router } from 'express';
import { RAGService } from '../services/rag.service.js';
import { GeminiService } from '../services/gemini.service.js';
import { VectorService } from '../services/vector.service.js';
import { DriveService } from '../services/drive.service.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import jwt from 'jsonwebtoken';

const router = Router();

// --- SERVER STARTUP VALIDATION ---
const REQUIRED_ENV_VARS = ['GCP_PROJECT_ID', 'JWT_SECRET'];
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  console.warn('⚠️ WARNING: Missing Environment Variables. Falling back to DEV DEFAULTS.');
  missingVars.forEach(v => console.warn(`   - ${v} (using default)`));
  
  // Set defaults for Dev/Demo mode
  if (!process.env.JWT_SECRET) process.env.JWT_SECRET = 'dev-secret-do-not-use-in-prod';
  if (!process.env.GCP_PROJECT_ID) process.env.GCP_PROJECT_ID = 'aikb-mock-project';
}

// Services
const geminiService = new GeminiService(process.env.GCP_PROJECT_ID || 'aikb-mock-project');
const vectorService = new VectorService(process.env.GCP_PROJECT_ID || 'aikb-prod', 'us-central1');
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(process.env.GCP_KEY_FILE || 'key.json');

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

// --- USER MANAGEMENT ROUTES ---

router.get('/users', authMiddleware, (req, res) => {
  res.json(MOCK_USERS);
});

router.patch('/users/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { role, status } = req.body;
  
  const userIndex = MOCK_USERS.findIndex(u => u.id === id);
  if (userIndex === -1) return res.status(404).json({ error: 'User not found' });

  const user = MOCK_USERS[userIndex];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const updatedUser = { ...user, role: role || user.role, status: status || user.status };
  MOCK_USERS[userIndex] = updatedUser;
  res.json(updatedUser);
});

// --- RAG & CHAT ROUTES ---

router.post('/query', authMiddleware, async (req: any, res) => {
  try {
    const { query } = req.body;
    const user = req.user;

    if (!query) return res.status(400).json({ error: 'Query is required' });

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

router.get('/documents', authMiddleware, async (req, res) => {
  try {
    if (!process.env.GOOGLE_DRIVE_FOLDER_ID) {
       // Fallback to mock docs if no Drive configured for demo
       return res.json([
         { id: 'd1', name: 'Security Policy 2024', category: 'Compliance', sensitivity: 'CONFIDENTIAL', status: 'Synced', date: new Date(), owner: 'alice@aikb.com' },
         { id: 'd2', name: 'Product Specs v2', category: 'Engineering', sensitivity: 'INTERNAL', status: 'Synced', date: new Date(), owner: 'charlie@aikb.com' }
       ]);
    }
    const files = await driveService.listFiles(process.env.GOOGLE_DRIVE_FOLDER_ID);
    
    const documents = files.map(f => ({
      id: f.id,
      name: f.name,
      category: f.mimeType?.includes('folder') ? 'Folder' : 'Document',
      sensitivity: 'INTERNAL', 
      status: 'Synced',
      date: f.modifiedTime,
      owner: f.owners?.[0]?.emailAddress
    }));

    res.json(documents);
  } catch (error: any) {
    console.error('Drive listing error:', error);
    // Graceful fallback for demo
    res.json([
       { id: 'd1', name: 'Security Policy 2024', category: 'Compliance', sensitivity: 'CONFIDENTIAL', status: 'Synced', date: new Date(), owner: 'alice@aikb.com' },
       { id: 'd2', name: 'Product Specs v2', category: 'Engineering', sensitivity: 'INTERNAL', status: 'Synced', date: new Date(), owner: 'charlie@aikb.com' }
     ]);
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
