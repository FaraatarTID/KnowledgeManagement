import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  JWT_SECRET: z.string()
    .min(64, "JWT_SECRET must be at least 64 characters long (use: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')")
    .regex(/^[a-f0-9]{64,}$/, "JWT_SECRET must be hex-encoded random bytes"),
  
  // Google Cloud
  GOOGLE_CLOUD_PROJECT_ID: z.string(),
  GCP_REGION: z.string().default('us-central1'),
  GCP_KEY_FILE: z.string().default('key.json'),
  GOOGLE_DRIVE_FOLDER_ID: z.string(),
  
  // Database / Supabase
  SUPABASE_URL: z.string().url().or(z.literal('')).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  
  // AI Config
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite-001'),
  EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  
  // RAG Config
  RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.60),
  RAG_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(100000),
  RAG_MAX_INPUT_TOKENS: z.coerce.number().int().positive().default(8000),
  RAG_MAX_COST_PER_REQUEST: z.coerce.number().positive().default(0.50), // $0.50 per request
  RAG_COST_PER_INPUT_K_TOKENS: z.coerce.number().positive().default(0.0075), // $0.0075 per 1K input tokens
  RAG_COST_PER_OUTPUT_K_TOKENS: z.coerce.number().positive().default(0.01), // $0.01 per 1K output tokens

  // Security
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),

  // Observability
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

const validateEnv = (): Env => {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Additional conditional logic
    if (parsed.NODE_ENV === 'production' || parsed.NODE_ENV === 'development') {
       if (!parsed.SUPABASE_URL || !parsed.SUPABASE_SERVICE_ROLE_KEY || parsed.SUPABASE_URL === '') {
          throw new Error('FATAL: Supabase credentials are required for identity management.');
       }
       if (parsed.GOOGLE_CLOUD_PROJECT_ID.includes('mock')) {
          throw new Error('GOOGLE_CLOUD_PROJECT_ID cannot be a mock project in non-test environments.');
       }
    }
    
    return parsed;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Failed to parse environment variables:', error);
    }
    
    if (process.env.NODE_ENV === 'test') {
       console.warn('⚠️  Validation failed in TEST mode. Providing minimal defaults.');
       return {
         NODE_ENV: 'test',
         PORT: '3001',
         JWT_SECRET: 'test-secret-at-least-thirty-two-characters-long',
         GOOGLE_CLOUD_PROJECT_ID: 'aikb-test-project',
         GOOGLE_DRIVE_FOLDER_ID: 'mock-folder-id',
         GCP_REGION: 'us-central1',
         GCP_KEY_FILE: 'key.json',
         GEMINI_MODEL: 'gemini-2.5-flash-lite-001',
         EMBEDDING_MODEL: 'text-embedding-004',
         RAG_MIN_SIMILARITY: 0.60,
         RAG_MAX_CONTEXT_CHARS: 100000,
         ALLOWED_ORIGINS: 'http://localhost:3000',
         ...process.env
       } as any;
    }
    process.exit(1);
  }
};

export const env = validateEnv();
