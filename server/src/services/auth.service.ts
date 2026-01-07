import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
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
const DEMO_USERS: (User & { password_hash: string })[] = [
  { 
    id: 'demo-admin', 
    name: 'Alice Admin', 
    email: 'alice@aikb.com', 
    password_hash: '$2b$10$xfB7/A0hMeTLENgVkjQq7OzOmOZMbeckmvMXlZoeBY/zFKp9XpF4C', // "admin123"
    role: 'ADMIN', 
    department: 'IT', 
    status: 'Active' 
  },
  { 
    id: 'demo-user', 
    name: 'David User', 
    email: 'david@aikb.com', 
    password_hash: '$2b$10$xfB7/A0hMeTLENgVkjQq7OzOmOZMbeckmvMXlZoeBY/zFKp9XpF4C', // "admin123"
    role: 'VIEWER', 
    department: 'Marketing', 
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
      
      const isValid = await bcrypt.compare(password, demoUser.password_hash);
      if (!isValid) return null;
      
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

      const isValid = await bcrypt.compare(password, data.password_hash);
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

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  isDemoModeEnabled(): boolean {
    return this.isDemoMode;
  }
}
