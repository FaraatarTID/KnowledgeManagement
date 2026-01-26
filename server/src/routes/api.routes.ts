import { Router } from 'express';
import authRoutes from './auth.routes.js';
import chatRoutes from './chat.routes.js';
import documentRoutes from './document.routes.js';
import userRoutes from './user.routes.js';
import systemRoutes from './system.routes.js';
import { vectorService } from '../container.js';
import crypto from 'crypto';

const router = Router();

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
