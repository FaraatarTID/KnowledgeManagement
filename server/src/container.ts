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
import dotenv from 'dotenv';
dotenv.config();

const geminiService = new GeminiService(process.env.GOOGLE_CLOUD_PROJECT_ID || 'aikb-mock-project');
const vectorService = new VectorService(process.env.GOOGLE_CLOUD_PROJECT_ID || 'aikb-mock-project', process.env.GCP_REGION || 'us-central1');
const auditService = new AuditService();
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(process.env.GCP_KEY_FILE || 'key.json');
const syncService = new SyncService(driveService, vectorService, geminiService);
const historyService = new HistoryService();
const configService = new ConfigService();
const authService = new AuthService();
const userService = new UserService();
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
