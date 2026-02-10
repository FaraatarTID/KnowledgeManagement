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
import { Logger } from './utils/logger.js';
import { env, resolveGeminiBackend } from './config/env.js';

const resolvedGeminiBackend = resolveGeminiBackend(
  env.GEMINI_BACKEND,
  Boolean(env.GOOGLE_API_KEY)
);

const useApiKeyGemini = resolvedGeminiBackend === 'AI_STUDIO';
const geminiCredential = useApiKeyGemini ? env.GOOGLE_API_KEY! : env.GOOGLE_CLOUD_PROJECT_ID!;

const geminiService = new GeminiService(
  geminiCredential,
  env.GCP_REGION,
  useApiKeyGemini
);
const metadataService = new SqliteMetadataService();
const vectorService = new VectorService(env.GOOGLE_CLOUD_PROJECT_ID || 'local-aikb', env.GCP_REGION, metadataService);
const auditService = new AuditService();
const ragService = new RAGService(geminiService, vectorService);
const driveService = new DriveService(env.GCP_KEY_FILE, Boolean(env.GOOGLE_DRIVE_FOLDER_ID));
const backupService = new BackupService(driveService);
const historyService = new HistoryService(metadataService);
const syncService = new SyncService(driveService, vectorService, geminiService, historyService);
const configService = new ConfigService();
const authService = new AuthService(metadataService);
const userService = new UserService(authService, metadataService);
const chatService = new ChatService(geminiService, vectorService, historyService);

Logger.info('Container: Runtime modes resolved', {
  vectorStoreMode: env.VECTOR_STORE_MODE,
  geminiBackend: resolvedGeminiBackend,
  driveEnabled: Boolean(env.GOOGLE_DRIVE_FOLDER_ID),
  supabaseEnabled: Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
});

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
