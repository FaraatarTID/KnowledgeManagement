import { GeminiService } from './services/gemini.service.js';
import { VectorService } from './services/vector.service.js';
import { SqliteMetadataService } from './services/sqlite-metadata.service.js';
import { DriveService } from './services/drive.service.js';
import { SyncService } from './services/sync.service.js';
import { HistoryService } from './services/history.service.js';
import { ConfigService } from './services/config.service.js';
import { AuthService } from './services/auth.service.js';
import { UserService } from './services/user.service.js';
import { AuditService } from './services/access.service.js';
import { RAGService } from './services/rag.service.js';
import { ChatService } from './services/chat.service.js';
import { BackupService } from './services/backup.service.js';
import { env } from './config/env.js';

const isLocalAI = env.VECTOR_STORE_MODE === 'LOCAL';
const geminiService = new GeminiService(
  isLocalAI ? env.GOOGLE_API_KEY! : env.GOOGLE_CLOUD_PROJECT_ID!,
  env.GCP_REGION,
  isLocalAI
);
const metadataService = new SqliteMetadataService();
const vectorService = new VectorService(env.GOOGLE_CLOUD_PROJECT_ID || 'local-aikb', env.GCP_REGION, metadataService);
const auditService = new AuditService();
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(env.GCP_KEY_FILE);
const backupService = new BackupService(driveService);
const historyService = new HistoryService(metadataService);
const syncService = new SyncService(driveService, vectorService, geminiService, historyService);
const configService = new ConfigService();
const authService = new AuthService(metadataService);
const userService = new UserService(authService, metadataService);
const chatService = new ChatService(geminiService, vectorService, historyService);

export {
    geminiService,
    vectorService,
    metadataService,
    auditService,
    ragService,
    driveService,
    backupService,
    syncService,
    historyService,
    configService,
    authService,
    userService,
    chatService
};
