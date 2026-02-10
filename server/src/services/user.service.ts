import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User, CreateUserDTO, UpdateUserDTO } from '../types/user.types.js';
import { env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { Logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class UserService {
  private supabase: SupabaseClient | null = null;
  private sqlite?: any; // SqliteMetadataService
  private isLocalMode: boolean = false;
  private isMock: boolean = false;
  private mockUsers: Array<User & { password_hash?: string }> = [];

  constructor(private authService: AuthService, sqlite?: any) {
    this.sqlite = sqlite;
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key && url !== '') {
      this.supabase = createClient(url, key);
      Logger.info('UserService: Supabase client initialized.');
    } else if (this.sqlite) {
      this.isLocalMode = true;
      Logger.info('UserService: Supabase missing. Initialized in LOCAL MODE (SQLite).');
    } else {
      if (env.NODE_ENV === 'test') {
        this.isMock = true;
        return;
      }
      throw new Error('FATAL: Supabase credentials and Local Storage both unavailable in UserService.');
    }
  }

  async initialize() {
    if (this.isMock) {
      await this.seedMockAdmin();
      return;
    }
    await this.seedDefaultAdmin();
  }

  private sanitizeUser(user: User & { password_hash?: string }): User {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  private async seedMockAdmin() {
    const existingAdmin = this.mockUsers.find(u => u.role === 'ADMIN');
    if (existingAdmin) return;

    const adminPassword = env.INITIAL_ADMIN_PASSWORD;
    if (!adminPassword) {
      throw new Error('INITIAL_ADMIN_PASSWORD is required for default admin seeding.');
    }

    const adminEmail = env.INITIAL_ADMIN_EMAIL.toLowerCase();
    const adminName = env.INITIAL_ADMIN_NAME;
    const password_hash = await this.authService.hashPassword(adminPassword);

    this.mockUsers.push({
      id: uuidv4(),
      email: adminEmail,
      name: adminName,
      password_hash,
      role: 'ADMIN',
      department: 'IT',
      status: 'Active'
    });

    Logger.info('UserService: Seeded mock admin user for test mode.');
  }

  private async seedDefaultAdmin() {
    let existingAdmin: any = null;

    if (this.isLocalMode) {
      existingAdmin = this.sqlite.getDatabase()
        .prepare('SELECT id FROM users WHERE role = ? LIMIT 1')
        .get('ADMIN');
    } else if (this.supabase) {
      const { data } = await this.supabase
        .from('users')
        .select('id')
        .eq('role', 'ADMIN')
        .limit(1)
        .maybeSingle();
      existingAdmin = data;
    }

    if (!existingAdmin) {
      const adminEmail = env.INITIAL_ADMIN_EMAIL.toLowerCase();
      const adminPassword = env.INITIAL_ADMIN_PASSWORD;
      const adminName = env.INITIAL_ADMIN_NAME;

      if (!adminPassword) {
        throw new Error('INITIAL_ADMIN_PASSWORD is required for default admin seeding.');
      }

      Logger.info(`UserService: No admins found. Seeding initial Admin (${adminEmail})...`);
      
      try {
        const password_hash = await this.authService.hashPassword(adminPassword);
        
        if (this.isLocalMode) {
          const result = this.sqlite.getDatabase()
            .prepare('INSERT INTO users (id, email, name, password_hash, role, department, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(uuidv4(), adminEmail, adminName, password_hash, 'ADMIN', 'IT', 'Active');
          Logger.info(`UserService: Admin seeded successfully. Insert result: ${JSON.stringify(result)}`);
        } else if (this.supabase) {
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
            Logger.error('UserService: Failed to seed admin', insertError);
            throw new Error(`Failed to seed admin: ${insertError.message}`);
          }
          Logger.info('UserService: Admin seeded successfully via Supabase.');
        }
        Logger.info('UserService: Initial Admin seeded successfully.');
      } catch (error) {
        Logger.error('UserService: Error during admin seeding', { error });
        throw error;
      }
    } else {
      Logger.info('UserService: Admin already exists, skipping seeding.');
    }
  }

  async getAll(): Promise<User[]> {
    if (this.isMock) {
      return this.mockUsers
        .map(user => this.sanitizeUser(user))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    
    if (this.isLocalMode) {
      return this.sqlite.getDatabase().prepare('SELECT id, email, name, role, department, status FROM users ORDER BY name').all() as User[];
    } else if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status')
        .order('name');
      if (error) throw error;
      return data as User[];
    }
    return [];
  }

  async getById(id: string): Promise<User | null> {
    if (this.isMock) {
      const user = this.mockUsers.find(u => u.id === id);
      return user ? this.sanitizeUser(user) : null;
    }

    if (this.isLocalMode) {
      return this.sqlite.getDatabase().prepare('SELECT id, email, name, role, department, status FROM users WHERE id = ?').get(id) as User || null;
    } else if (this.supabase) {
      const { data } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status')
        .eq('id', id)
        .maybeSingle();
      return data as User || null;
    }
    return null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const normalized = email.toLowerCase().trim();
    if (this.isMock) {
      const user = this.mockUsers.find(u => u.email === normalized);
      return user ? this.sanitizeUser(user) : null;
    }

    if (this.isLocalMode) {
      return this.sqlite.getDatabase().prepare('SELECT id, email, name, role, department, status FROM users WHERE email = ?').get(normalized) as User || null;
    } else if (this.supabase) {
      const { data } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status')
        .eq('email', normalized)
        .maybeSingle();
      return data as User || null;
    }
    return null;
  }

  async update(id: string, updates: UpdateUserDTO): Promise<User | null> {
    if (this.isMock) {
      const user = this.mockUsers.find(u => u.id === id);
      if (!user) return null;

      Object.assign(user, updates);
      return this.sanitizeUser(user);
    }

    if (this.isLocalMode) {
      const keys = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = keys.map(k => `${k} = ?`).join(', ');
      this.sqlite.getDatabase().prepare(`UPDATE users SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...values, id);
      return this.getById(id);
    } else if (this.supabase) {
      const { data, error } = await this.supabase
        .from('users')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, email, name, role, department, status')
        .single();
      if (error) return null;
      return data as User;
    }
    return null;
  }

  async create(userData: CreateUserDTO): Promise<User | null> {
    const password_hash = await this.authService.hashPassword(userData.password);
    const id = uuidv4();

    if (this.isMock) {
      const normalizedEmail = userData.email.toLowerCase().trim();
      const exists = this.mockUsers.some(u => u.email === normalizedEmail);
      if (exists) return null;

      const user = {
        id,
        email: normalizedEmail,
        name: userData.name.trim(),
        password_hash,
        role: userData.role || 'VIEWER',
        department: userData.department || 'General',
        status: 'Active'
      };

      this.mockUsers.push(user);
      return this.sanitizeUser(user);
    }

    if (this.isLocalMode) {
      this.sqlite.getDatabase()
        .prepare('INSERT INTO users (id, email, name, password_hash, role, department, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, userData.email.toLowerCase().trim(), userData.name.trim(), password_hash, userData.role || 'VIEWER', userData.department || 'General', 'Active');
      return this.getById(id);
    } else if (this.supabase) {
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
      if (error) return null;
      return data as User;
    }
    return null;
  }

  async delete(id: string): Promise<boolean> {
    if (this.isMock) {
      const before = this.mockUsers.length;
      this.mockUsers = this.mockUsers.filter(u => u.id !== id);
      return this.mockUsers.length !== before;
    }

    if (this.isLocalMode) {
      this.sqlite.getDatabase().prepare('DELETE FROM users WHERE id = ?').run(id);
      return true;
    } else if (this.supabase) {
      const { error } = await this.supabase.from('users').delete().eq('id', id);
      return !error;
    }
    return false;
  }

  async updatePassword(id: string, newPassword: string): Promise<boolean> {
    const password_hash = await this.authService.hashPassword(newPassword);

    if (this.isMock) {
      const user = this.mockUsers.find(u => u.id === id);
      if (!user) return false;
      user.password_hash = password_hash;
      return true;
    }

    if (this.isLocalMode) {
      this.sqlite.getDatabase().prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(password_hash, id);
      return true;
    } else if (this.supabase) {
      const { error } = await this.supabase.from('users').update({ password_hash, updated_at: new Date().toISOString() }).eq('id', id);
      return !error;
    }
    return false;
  }

  async checkHealth(): Promise<{ status: 'OK' | 'ERROR'; message?: string }> {
    if (this.isMock) {
      return { status: 'OK', message: `Test in-memory identity store active (${this.mockUsers.length} users)` };
    }
    
    try {
      if (this.isLocalMode) {
        this.sqlite.getDatabase().prepare('SELECT 1').get();
        return { status: 'OK', message: 'Local Storage (SQLite) Active' };
      } else if (this.supabase) {
        const { error } = await this.supabase.from('users').select('id').limit(1);
        if (error) throw error;
        return { status: 'OK', message: 'Connected to Supabase' };
      }
      return { status: 'ERROR', message: 'No storage available' };
    } catch (e: any) {
      return { status: 'ERROR', message: `Identity Store Error: ${e.message}` };
    }
  }
}
