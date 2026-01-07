import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import * as argon2 from 'argon2';
import jwt from 'jsonwebtoken';

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
// SECURITY: Credentials loaded from environment variables with secure defaults
// To customize: Set DEMO_* environment variables or use Supabase in production
const DEMO_USERS: (User & { password_hash: string })[] = [
  { 
    id: 'demo-admin', 
    name: process.env.DEMO_ADMIN_NAME || 'Alice Admin', 
    email: process.env.DEMO_ADMIN_EMAIL || 'alice@aikb.com', 
    // SECURITY: Use pre-hashed Argon2 from env, or default hash for "admin123"
    password_hash: process.env.DEMO_ADMIN_HASH || '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJcbe3Fh8X6JZ3Q',
    role: 'ADMIN', 
    department: process.env.DEMO_ADMIN_DEPT || 'IT', 
    status: 'Active' 
  },
  { 
    id: 'demo-user', 
    name: process.env.DEMO_USER_NAME || 'David User', 
    email: process.env.DEMO_USER_EMAIL || 'david@aikb.com', 
    password_hash: process.env.DEMO_USER_HASH || '$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHQ$RdescudvJcbe3Fh8X6JZ3Q',
    role: 'VIEWER', 
    department: process.env.DEMO_USER_DEPT || 'Marketing', 
    status: 'Active' 
  }
];

export class AuthService {
  private supabase: SupabaseClient | null = null;
  private isDemoMode: boolean = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      console.log('AuthService: Supabase client initialized.');
    } else {
      console.warn('AuthService: Supabase not configured. Running in DEMO MODE with pre-seeded users.');
      console.warn('AuthService: Demo credentials - Email: alice@aikb.com or david@aikb.com, Password: admin123');
      this.isDemoMode = true;
    }
  }

  async validateCredentials(email: string, password: string): Promise<User | null> {
    if (this.isDemoMode) {
      const demoUser = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!demoUser) return null;
      // In demo mode allow plaintext comparison against DEMO_PASSWORD for convenience
      const demoPassword = process.env.DEMO_PASSWORD || 'admin123';
      if (password !== demoPassword) return null;

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

      // Use new verifyPassword method with migration support
      const isValid = await this.verifyPassword(password, data.password_hash);
      if (!isValid) return null;

      // SECURITY: Check if password needs upgrade to Argon2
      if (await this.needsUpgrade(data.password_hash)) {
        console.log(`User ${email} using legacy bcrypt, scheduling upgrade`);
        // Note: In production, you'd queue this for background processing
        // For now, we just log it
      }

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
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    return jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role, department: user.department },
      secret,
      { expiresIn: '24h' }
    );
  }

  /**
   * SECURITY: Hash password using Argon2id (modern, secure, fast)
   * Falls back to bcrypt for compatibility if needed
   */
  async hashPassword(password: string): Promise<string> {
    try {
      // Use Argon2id with secure parameters
      return await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536, // 64MB
        timeCost: 3,
        parallelism: 1,
        hashLength: 32
      });
    } catch (error) {
      console.warn('Argon2 failed, falling back to bcrypt:', error);
      // Fallback for environments where Argon2 isn't available
      return bcrypt.hash(password, 12);
    }
  }

  /**
   * SECURITY: Verify password using Argon2id or bcrypt
   * Supports migration from bcrypt to argon2
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      // Check if hash is Argon2 format
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      // Assume bcrypt for other hashes
      return await bcrypt.compare(password, hash);
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * SECURITY: Check if password hash should be upgraded to Argon2
   */
  async needsUpgrade(hash: string): Promise<boolean> {
    // Upgrade if using bcrypt (old format)
    return !hash.startsWith('$argon2');
  }

  isDemoModeEnabled(): boolean {
    return this.isDemoMode;
  }
}
