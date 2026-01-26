import { Router } from 'express';
import authRoutes from './auth.routes.js';
import chatRoutes from './chat.routes.js';
import documentRoutes from './document.routes.js';
import userRoutes from './user.routes.js';
import systemRoutes from './system.routes.js';
import { vectorService } from '../container.js';
import crypto from 'crypto';

const router = Router();

// --- SERVER STARTUP VALIDATION ---
const REQUIRED_ENV_VARS = ['GCP_PROJECT_ID', 'JWT_SECRET', 'GOOGLE_CLOUD_PROJECT_ID'];
const missingVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);

if (missingVars.length > 0) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Missing required environment variables in production:', missingVars);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  console.warn('⚠️ WARNING: Missing Environment Variables.');
  missingVars.forEach(v => console.warn(`   - ${v}`));
  
  if (!process.env.JWT_SECRET) {
      const devSecret = crypto.randomBytes(32).toString('hex');
      process.env.JWT_SECRET = devSecret;
      console.warn('⚠️ Generated temporary JWT_SECRET for dev session. Set JWT_SECRET env var for persistence.');
  }
  if (!process.env.GCP_PROJECT_ID) process.env.GCP_PROJECT_ID = 'aikb-mock-project';
}

if (process.env.NODE_ENV === 'production' && process.env.GCP_PROJECT_ID === 'aikb-mock-project') {
  console.error('❌ FATAL: Using "aikb-mock-project" in production is not allowed.');
  throw new Error('Invalid GCP_PROJECT_ID for production environment.');
}

// --- GRACEFUL SHUTDOWN ---
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

// Listeners might be registered multiple times if this file is imported largely, 
// but in Express setup it usually runs once. 
// To avoid listener leak warnings in tests/dev:
if (process.listenerCount('SIGINT') === 0) {
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// --- MOUNT ROUTES ---

// Mount Auth routes under /auth
router.use('/auth', authRoutes);

// Mount Chat routes under / (it defines /chat, /query, etc.)
// Note: Chat routes already define /chat and /query paths
router.use('/', chatRoutes);

// Mount other routers
// documentRoutes defines /upload, /documents, /sync
router.use('/', documentRoutes);

// userRoutes defines /users (at root of router) 
// In user.routes.ts: router.get('/', ...) -> so we mount it at /users
router.use('/users', userRoutes);

// systemRoutes defines /ping, /health, /config, /stats, /system/*
router.use('/', systemRoutes);

export default router;
