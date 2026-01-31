import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User, CreateUserDTO, UpdateUserDTO } from '../types/user.types.js';
import { env } from '../config/env.js';
import { AuthService } from './auth.service.js';

export class UserService {
  private supabase: SupabaseClient;
  private isMock: boolean = false;

  constructor(private authService: AuthService) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'production') {
        throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing in UserService. App cannot function in production.');
      } else {
        console.warn('UserService: Supabase credentials missing. Entering MOCK MODE.');
        this.isMock = true;
        this.supabase = {} as any;
        return;
      }
    }

    this.supabase = createClient(url, key);
  }

  /**
   * Explicit initialization for seeding.
   * Call this during app startup, not in constructor.
   */
  async initialize() {
    if (this.isMock) return;
    await this.seedDefaultAdmin();
  }

  private async seedDefaultAdmin() {
    // Check if any admin exists
    const { data: existingAdmin, error: checkError } = await this.supabase
      .from('users')
      .select('id')
      .eq('role', 'ADMIN')
      .limit(1)
      .maybeSingle();

    if (checkError) {
      console.error('UserService: Failed to check for existing admin', checkError);
      return;
    }

    if (!existingAdmin) {
      const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || 'alice@aikb.com').toLowerCase();
      const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';
      const adminName = process.env.INITIAL_ADMIN_NAME || 'Alice Admin';

      console.log(`UserService: No admins found. Seeding initial Admin (${adminEmail})...`);
      const password_hash = await this.authService.hashPassword(adminPassword);
      
      const { error: insertError } = await this.supabase
        .from('users')
        .insert({
          email: adminEmail,
          name: adminName,
          password_hash,
          role: 'ADMIN',
          department: 'IT',
          status: 'Active'
        });

      if (insertError) {
        console.error('UserService: Failed to seed admin', insertError);
      } else {
        console.log('UserService: Initial Admin seeded successfully.');
      }
    }
  }

  async getAll(): Promise<User[]> {
    if (this.isMock) return [];
    
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .order('name');

    if (error) {
      console.error('UserService: getAll failed', error);
      throw new Error('Database operation failed');
    }
    return data as User[];
  }

  async getById(id: string): Promise<User | null> {
    if (this.isMock) return null;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('UserService: getById failed', error);
      return null;
    }
    return data as User;
  }

  async getByEmail(email: string): Promise<User | null> {
    if (this.isMock) return null;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      console.error('UserService: getByEmail failed', error);
      return null;
    }
    return data as User;
  }

  async update(id: string, updates: UpdateUserDTO): Promise<User | null> {
    if (this.isMock) return null;

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
    if (this.isMock) return null;

    const password_hash = await this.authService.hashPassword(userData.password);

    const { data, error } = await this.supabase
      .from('users')
      .insert({
          email: userData.email.toLowerCase().trim(),
          name: userData.name.trim(),
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
    if (this.isMock) return false;

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
    if (this.isMock) return false;

    const password_hash = await this.authService.hashPassword(newPassword);

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
    if (this.isMock) return { status: 'OK', message: 'Mock Mode Active' };
    
    try {
      const { error } = await this.supabase.from('users').select('id').limit(1);
      if (error) throw error;
      return { status: 'OK', message: 'Connected to Supabase' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Supabase Error: ${e.message}` };
    }
  }
}
