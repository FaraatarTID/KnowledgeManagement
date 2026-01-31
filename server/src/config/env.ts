import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
  JWT_SECRET: z.string().default('development-secret-change-me-next-time'),
  
  // Google Cloud
  GOOGLE_CLOUD_PROJECT_ID: z.string().default(process.env.NODE_ENV === 'test' ? 'aikb-test-project' : 'aikb-mock-project'),
  GCP_REGION: z.string().default('us-central1'),
  GCP_KEY_FILE: z.string().default('key.json'),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional().default(process.env.NODE_ENV === 'test' ? 'mock-folder-id' : ''),
  
  // Database / Supabase
  SUPABASE_URL: z.string().url().or(z.literal('')).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  
  // AI Config
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite-001'),
  EMBEDDING_MODEL: z.string().default('text-embedding-004'),
  
  // RAG Config
  RAG_MIN_SIMILARITY: z.coerce.number().min(0).max(1).default(0.60),
  RAG_MAX_CONTEXT_CHARS: z.coerce.number().int().positive().default(100000),

  // Security
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://127.0.0.1:3000'),
});

export type Env = z.infer<typeof envSchema>;

const validateEnv = (): Env => {
  try {
    const parsed = envSchema.parse(process.env);
    
    // Additional conditional logic
    if (parsed.NODE_ENV === 'production') {
       if (parsed.JWT_SECRET.length < 32) {
          throw new Error('JWT_SECRET must be at least 32 characters long in production.');
       }
       if (!parsed.SUPABASE_URL || !parsed.SUPABASE_SERVICE_ROLE_KEY || parsed.SUPABASE_URL === '') {
          throw new Error('FATAL: Supabase credentials are required in production.');
       }
       if (parsed.GOOGLE_CLOUD_PROJECT_ID === 'aikb-mock-project') {
          throw new Error('GOOGLE_CLOUD_PROJECT_ID cannot be "aikb-mock-project" in production.');
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
       console.warn('⚠️  Validation failed in TEST mode. Continuing with defaults.');
       return process.env as any;
    }
    process.exit(1);
  }
};

export const env = validateEnv();
