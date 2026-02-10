import { z } from 'zod';
import 'dotenv/config';
import { randomBytes } from 'crypto';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  JWT_SECRET: z.string()
    .min(64, "JWT_SECRET must be at least 64 characters long (use: node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')")
    .regex(/^[a-f0-9]{64,}$/, "JWT_SECRET must be hex-encoded random bytes")
    .optional(),
  
  // Google Cloud / AI Studio
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  VECTOR_STORE_MODE: z.enum(['VERTEX', 'LOCAL']).default('LOCAL'),
  VECTOR_LOCAL_MAX_CANDIDATES: z.coerce.number().int().positive().default(5000),
  GCP_REGION: z.string().default('us-central1'),
  GCP_KEY_FILE: z.string().default('google-key.json'),
  GOOGLE_DRIVE_FOLDER_ID: z.string(),
  
  // Database / Supabase
  SUPABASE_URL: z.string().url().or(z.literal('')).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  
  // Initial Admin Setup (Bootstrapping)
  INITIAL_ADMIN_EMAIL: z.string().email().default('admin@aikb.com'),
  INITIAL_ADMIN_PASSWORD: z.string()
    .min(10, "INITIAL_ADMIN_PASSWORD must be at least 10 characters long")
    .regex(/[A-Z]/, "INITIAL_ADMIN_PASSWORD must contain at least one uppercase letter")
    .regex(/[a-z]/, "INITIAL_ADMIN_PASSWORD must contain at least one lowercase letter")
    .regex(/[0-9]/, "INITIAL_ADMIN_PASSWORD must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "INITIAL_ADMIN_PASSWORD must contain at least one special character")
    .optional(),
  INITIAL_ADMIN_NAME: z.string().default('System Administrator'),

  // AI Config
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
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
  SENTRY_DSN: z.string().url().or(z.literal('')).optional(),
});

export type Env = Omit<z.infer<typeof envSchema>, 'JWT_SECRET'> & { JWT_SECRET: string };

const validateEnv = (): Env => {
  try {
    const testDefaults = process.env.NODE_ENV === 'test' ? {
      GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID || '',
      INITIAL_ADMIN_EMAIL: process.env.INITIAL_ADMIN_EMAIL || 'admin@aikb.com',
      INITIAL_ADMIN_PASSWORD: process.env.INITIAL_ADMIN_PASSWORD || 'TestAdmin@12345',
      INITIAL_ADMIN_NAME: process.env.INITIAL_ADMIN_NAME || 'System Administrator',
      JWT_SECRET: process.env.JWT_SECRET || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID || 'aikb-test-project',
      GCP_REGION: process.env.GCP_REGION || 'us-central1',
      GCP_KEY_FILE: process.env.GCP_KEY_FILE || 'key.json',
      VECTOR_LOCAL_MAX_CANDIDATES: process.env.VECTOR_LOCAL_MAX_CANDIDATES || '5000',
      GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-flash-latest',
      EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-004',
      RAG_MIN_SIMILARITY: process.env.RAG_MIN_SIMILARITY || '0.60',
      RAG_MAX_CONTEXT_CHARS: process.env.RAG_MAX_CONTEXT_CHARS || '100000',
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    } : {};

    const parsed = envSchema.parse({ ...process.env, ...testDefaults });

    const resolved: Env = { ...parsed, JWT_SECRET: parsed.JWT_SECRET ?? "" };

    if (!resolved.JWT_SECRET) {
      if (resolved.VECTOR_STORE_MODE === 'LOCAL') {
        resolved.JWT_SECRET = randomBytes(32).toString('hex');
        console.warn('⚠️  JWT_SECRET not set in Easy Mode (LOCAL). Generated an ephemeral secret for this process; existing sessions will be invalidated after restart.');
      } else {
        throw new Error('JWT_SECRET is mandatory when VECTOR_STORE_MODE is VERTEX.');
      }
    }
    
    // Additional conditional logic
    if (resolved.NODE_ENV === 'production' || resolved.NODE_ENV === 'development') {
       if (!resolved.INITIAL_ADMIN_PASSWORD) {
          throw new Error('INITIAL_ADMIN_PASSWORD is mandatory in development/production to prevent insecure default admin credentials.');
       }

       if (resolved.VECTOR_STORE_MODE === 'VERTEX' && !resolved.GOOGLE_CLOUD_PROJECT_ID) {
          throw new Error('GOOGLE_CLOUD_PROJECT_ID is mandatory when VECTOR_STORE_MODE is VERTEX.');
       }
       
       if (resolved.VECTOR_STORE_MODE === 'LOCAL' && !resolved.GOOGLE_API_KEY) {
          throw new Error('GOOGLE_API_KEY is mandatory when VECTOR_STORE_MODE is LOCAL (Easy Mode).');
       }

       if (!resolved.SUPABASE_URL || !resolved.SUPABASE_SERVICE_ROLE_KEY || resolved.SUPABASE_URL === '') {
          console.warn('⚠️  Supabase credentials missing. Switching to LOCAL STORAGE MODE (SQLite).');
       }
       
       if (resolved.GOOGLE_CLOUD_PROJECT_ID && resolved.GOOGLE_CLOUD_PROJECT_ID.includes('mock') && resolved.NODE_ENV === 'production') {
          throw new Error('GOOGLE_CLOUD_PROJECT_ID cannot be a mock project in production.');
       }
    }
    
    return resolved;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`   - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Failed to parse environment variables:', error);
    }
    
    process.exit(1);
  }
};

export const env = validateEnv();
