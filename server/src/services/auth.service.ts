import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { User, UserRole, CreateUserDTO } from '../types/user.types.js';

export interface AuthResult {
  user: User;
  token: string;
}

export class AuthService {
  private supabase: SupabaseClient;
  // Pre-calculated hash for timing attack mitigation
  private static readonly DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$745p5p5p5p5p5p5p5p5p5w$p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5';

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'test') {
        this.supabase = {} as any;
        return;
      }
      throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing. Authentication cannot function.');
    }

    this.supabase = createClient(url, key);
    console.log('AuthService: Supabase client initialized.');
  }

  /**
   * Validates user credentials.
   * Mitigates timing attacks by always performing a hash verification.
   */
  async validateCredentials(email: string, password: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .single();

      // If user not found, we still perform a verify operation with a dummy hash
      // to ensure the response time is consistent with a valid user check.
      if (error || !data) {
        await argon2.verify(AuthService.DUMMY_HASH, password);
        return null; 
      }

      const isValid = await this.verifyPassword(password, data.password_hash);
      if (!isValid) return null;

      const { password_hash, ...user } = data;
      return user as User;
    } catch (e) {
      console.error('AuthService: validateCredentials failed', e);
      return null;
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status')
        .eq('id', id)
        .single();

      if (error || !data) return null;
      return data as User;
    } catch (e) {
      console.error('AuthService: getUserById failed', e);
      return null;
    }
  }

  generateToken(user: User): string {
    return jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department },
      env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32
    });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      // Argon2 is the only supported hash. BCrypt is deprecated and removed for new hashes.
      // If legacy BCrypt hashes exist, they must be migrated on next login.
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      
      // Temporary fallback for legacy migration (to be removed after rollout)
      // Note: bcrypt is not imported anymore, this will throw if reached.
      // This is intentional to force argon2 usage.
      throw new Error('Legacy BCrypt hash detected. Authentication requires Argon2.');
    } catch (error) {
      console.error('AuthService: Password verification failed', error);
      return false;
    }
  }
}
