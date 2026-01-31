import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';
  department: string;
  status: 'Active' | 'Inactive';
}

export interface CreateUserDTO {
  email: string;
  password: string;
  name: string;
  role?: User['role'];
  department?: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

// Fallback demo users for when Supabase is not configured


export class AuthService {
  private supabase: SupabaseClient;

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'production') {
        throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing. Authentication cannot function in production.');
      } else {
        console.warn('AuthService: Supabase credentials missing. Entering MOCK MODE (dev/test only).');
        // We'll use a dummy client for non-production so it doesn't crash, 
        // though calls will likely fail if not caught by controller mocks.
        this.supabase = {} as any; 
        return;
      }
    }

    this.supabase = createClient(url, key);
    console.log('AuthService: Supabase client initialized.');
  }

  async validateCredentials(email: string, password: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error || !data) {
        // Timing attack mitigation: always do a verify even if user not found?
        // For now, prompt return is acceptable but suboptimal for high security.
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
      // Legacy support for bcrypt if needed during migration, otherwise enforce argon2
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('AuthService: Password verification failed', error);
      return false;
    }
  }


}
