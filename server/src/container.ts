import { GeminiService } from './services/gemini.service.js';
import { VectorService } from './services/vector.service.js';
import { DriveService } from './services/drive.service.js';
import { SyncService } from './services/sync.service.js';
import { HistoryService } from './services/history.service.js';
import { ConfigService } from './services/config.service.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { AuditService } from './services/access.service.js';
import { RAGService } from './services/rag.service.js';
import { ChatService } from './services/chat.service.js';
import { env } from './config/env.js';

const geminiService = new GeminiService(env.GOOGLE_CLOUD_PROJECT_ID);
const vectorService = new VectorService(env.GOOGLE_CLOUD_PROJECT_ID, env.GCP_REGION);
const auditService = new AuditService();
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(env.GCP_KEY_FILE);
const syncService = new SyncService(driveService, vectorService, geminiService);
const historyService = new HistoryService();
const configService = new ConfigService();
const authService = new AuthService();
const userService = new UserService(authService);
const chatService = new ChatService();

export {
    geminiService,
    vectorService,
    auditService,
    ragService,
    driveService,
    syncService,
    historyService,
    configService,
    authService,
    userService,
    chatService
};
