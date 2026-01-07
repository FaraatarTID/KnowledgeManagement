import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import type { User, CreateUserDTO } from './auth.service.js';

export interface UpdateUserDTO {
  name?: string;
  role?: User['role'];
  department?: string;
  status?: User['status'];
}

// Mutable demo users for when Supabase is not configured
let DEMO_USERS: (User & { password_hash: string })[] = [
  { 
    id: 'demo-admin', 
    name: 'Alice Admin', 
    email: 'alice@aikb.com', 
    password_hash: '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq3i5Q5DB4zX9bLh.tPbu',
    role: 'ADMIN', 
    department: 'IT', 
    status: 'Active' 
  },
  { 
    id: 'demo-manager', 
    name: 'Bob Manager', 
    email: 'bob@aikb.com', 
    password_hash: '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq3i5Q5DB4zX9bLh.tPbu',
    role: 'MANAGER', 
    department: 'Sales', 
    status: 'Active' 
  },
  { 
    id: 'demo-editor', 
    name: 'Charlie Dev', 
    email: 'charlie@aikb.com', 
    password_hash: '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq3i5Q5DB4zX9bLh.tPbu',
    role: 'EDITOR', 
    department: 'Engineering', 
    status: 'Active' 
  },
  { 
    id: 'demo-user', 
    name: 'David User', 
    email: 'david@aikb.com', 
    password_hash: '$2a$10$XOPbrlUPQdwdJUpSrIF6X.LbE14qsMmKGq3i5Q5DB4zX9bLh.tPbu',
    role: 'VIEWER', 
    department: 'Marketing', 
    status: 'Active' 
  }
];

export class UserService {
  private supabase: SupabaseClient | null = null;
  private isDemoMode: boolean = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      this.supabase = createClient(url, key);
      // Bootstrapping: Ensure at least one admin exists
      this.seedDefaultAdmin().catch(err => console.error('UserService: Seeding failed', err));
    } else {
      this.isDemoMode = true;
    }
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
    if (this.isDemoMode) {
      return DEMO_USERS.map(({ password_hash, ...user }) => user);
    }

    if (!this.supabase) return [];

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
    if (this.isDemoMode) {
      const user = DEMO_USERS.find(u => u.id === id);
      if (!user) return null;
      const { password_hash, ...userData } = user;
      return userData;
    }

    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('id', id)
      .single();

    if (error) return null;
    return data as User;
  }

  async getByEmail(email: string): Promise<User | null> {
    if (this.isDemoMode) {
      const user = DEMO_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!user) return null;
      const { password_hash, ...userData } = user;
      return userData;
    }

    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status')
      .eq('email', email.toLowerCase())
      .single();

    if (error) return null;
    return data as User;
  }

  async update(id: string, updates: UpdateUserDTO): Promise<User | null> {
    if (this.isDemoMode) {
      const index = DEMO_USERS.findIndex(u => u.id === id);
      if (index === -1) return null;
      
      DEMO_USERS[index] = { ...DEMO_USERS[index]!, ...updates } as any;
      const { password_hash, ...userData } = DEMO_USERS[index]!;
      return userData;
    }

    if (!this.supabase) return null;

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
    const password_hash = await bcrypt.hash(userData.password, 10);

    if (this.isDemoMode) {
      const newUser = {
        id: `demo-${Date.now()}`,
        email: userData.email.toLowerCase(),
        name: userData.name,
        password_hash,
        role: userData.role || 'VIEWER' as const,
        department: userData.department || 'General',
        status: 'Active' as const
      };
      DEMO_USERS.push(newUser);
      const { password_hash: _, ...user } = newUser;
      return user;
    }

    if (!this.supabase) return null;

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
    if (this.isDemoMode) {
      const index = DEMO_USERS.findIndex(u => u.id === id);
      if (index === -1) return false;
      DEMO_USERS.splice(index, 1);
      return true;
    }

    if (!this.supabase) return false;

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
    const password_hash = await bcrypt.hash(newPassword, 10);

    if (this.isDemoMode) {
      const user = DEMO_USERS.find(u => u.id === id);
      if (!user) return false;
      user.password_hash = password_hash;
      return true;
    }

    if (!this.supabase) return false;

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

  isDemoModeEnabled(): boolean {
    return this.isDemoMode;
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    if (this.isDemoMode) return { status: 'OK', message: 'Demo Mode (Local JSON)' };
    if (!this.supabase) return { status: 'ERROR', message: 'Supabase not initialized' };
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
