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
const DEMO_USERS: (User & { password_hash: string })[] = [
  { 
    id: 'demo-admin', 
    name: 'Alice Admin', 
    email: 'alice@aikb.com', 
    password_hash: '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJcbe3Fh8X6JZ3Q',
    role: 'ADMIN', 
    department: 'IT', 
    status: 'Active' 
  },
  { 
    id: 'demo-user', 
    name: 'David User', 
    email: 'david@aikb.com', 
    password_hash: '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJcbe3Fh8X6JZ3Q',
    role: 'VIEWER', 
    department: 'Marketing', 
    status: 'Active' 
  }
];

export class AuthService {
  private supabase: SupabaseClient | null = null;
  private isDemoMode: boolean = false;

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      console.log('AuthService: Supabase client initialized.');
    } else {
      if (env.NODE_ENV === 'production') {
        throw new Error('FATAL: Supabase credentials required in production.');
      }
      console.warn('AuthService: Running in DEMO MODE.');
      this.isDemoMode = true;
    }
  }

  async validateCredentials(email: string, password: string): Promise<User | null> {
    if (this.isDemoMode) {
      const demoUser = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!demoUser) return null;
      if (password !== 'admin123') return null;

      const { password_hash, ...user } = demoUser;
      return user;
    }

    if (!this.supabase) return null;

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .single();

      if (error || !data) return null;

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
    if (this.isDemoMode) {
      const demoUser = DEMO_USERS.find(u => u.id === id);
      if (!demoUser) return null;
      const { password_hash, ...user } = demoUser;
      return user;
    }

    if (!this.supabase) return null;

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
    try {
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
        hashLength: 32
      });
    } catch (error) {
      return bcrypt.hash(password, 12);
    }
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      return await bcrypt.compare(password, hash);
    } catch (error) {
      return false;
    }
  }

  async needsUpgrade(hash: string): Promise<boolean> {
    return !hash.startsWith('$argon2');
  }

  isDemoModeEnabled(): boolean {
    return this.isDemoMode;
  }
}
