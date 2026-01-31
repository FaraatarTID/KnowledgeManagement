import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import type { User, CreateUserDTO } from './auth.service.js';
import { env } from '../config/env.js';

export interface UpdateUserDTO {
  name?: string;
  role?: User['role'];
  department?: string;
  status?: User['status'];
}

export class UserService {
  private supabase: SupabaseClient;

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'production') {
        throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing in UserService. App cannot function in production.');
      } else {
        console.warn('UserService: Supabase credentials missing. Entering MOCK MODE (dev/test only).');
        this.supabase = {} as any;
        return;
      }
    }

    this.supabase = createClient(url, key);
    // Bootstrapping: Ensure at least one admin exists
    this.seedDefaultAdmin().catch(err => console.error('UserService: Seeding failed', err));
  }

  /**
   * Checks if the database is empty/missing admin and seeds the default admin.
   */
  private async seedDefaultAdmin() {
    if (!this.supabase) return;

    // Check if Alice exists
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', 'alice@aikb.com')
      .single();

    if (!existingUser) {
      const adminEmail = process.env.INITIAL_ADMIN_EMAIL || 'alice@aikb.com';
      const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
      const adminName = process.env.INITIAL_ADMIN_NAME || 'Alice Admin';

      console.log(`UserService: No users found. Seeding initial Admin (${adminEmail})...`);
      const password_hash = await bcrypt.hash(adminPassword, 10);
      
      const { error } = await this.supabase
        .from('users')
        .insert({
          email: adminEmail.toLowerCase(),
          name: adminName,
          password_hash,
          role: 'ADMIN',
          department: 'IT',
          status: 'Active'
        });

      if (error) {
        console.error('UserService: Failed to seed admin', error);
      } else {
        console.log('UserService: Default Admin (Alice) seeded successfully.');
      }
    }
  }

  async getAll(): Promise<User[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .order('name');

    if (error) {
      console.error('UserService: getAll failed', error);
      return [];
    }
    return data as User[];
  }

  async getById(id: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as User;
  }

  async getByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('email', email.toLowerCase())
      .single();

    if (error) return null;
    return data as User;
  }

  async update(id: string, updates: UpdateUserDTO): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, name, role, department, status')
      .single();

    if (error) {
      console.error('UserService: update failed', error);
      return null;
    }
    return data as User;
  }

  async create(userData: CreateUserDTO): Promise<User | null> {
    // SECURITY: Use a robust hash. For now keeping bcrypt as it was used, 
    // but should ideally move to argon2.
    const password_hash = await bcrypt.hash(userData.password, 12);

    const { data, error } = await this.supabase
      .from('users')
      .insert({
          email: userData.email.toLowerCase(),
          name: userData.name,
          password_hash,
          role: userData.role || 'VIEWER',
          department: userData.department || 'General',
          status: 'Active'
      })
      .select('id, email, name, role, department, status')
      .single();

    if (error) {
      console.error('UserService: create failed', error);
      return null;
    }
    return data as User;
  }

  async delete(id: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('UserService: delete failed', error);
      return false;
    }
    return true;
  }

  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const password_hash = await bcrypt.hash(newPassword, 12);

    const { error } = await this.supabase
      .from('users')
      .update({ password_hash, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('UserService: updatePassword failed', error);
      return false;
    }
    return true;
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    try {
      // Test by selecting 1 user
      const { error } = await this.supabase.from('users').select('id').limit(1);
      if (error) throw error;
      return { status: 'OK', message: 'Connected to Supabase' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Supabase Error: ${e.message}` };
    }
  }
}
