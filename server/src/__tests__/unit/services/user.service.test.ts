import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '../../../services/user.service.js';

const hashPassword = vi.fn(async (value: string) => `hash:${value}`);

const createSqliteStub = () => {
  const users: any[] = [];

  const db = {
    prepare: (query: string) => {
      if (query.startsWith('SELECT id FROM users WHERE role = ? LIMIT 1')) {
        return {
          get: (role: string) => users.find((u) => u.role === role) || undefined
        };
      }

      if (query.startsWith('INSERT INTO users')) {
        return {
          run: (...args: any[]) => {
            const [id, email, name, password_hash, role, department, status] = args;
            if (users.some((u) => u.email === email)) {
              throw new Error('duplicate email');
            }
            users.push({ id, email, name, password_hash, role, department, status });
            return { changes: 1 };
          }
        };
      }

      if (query.startsWith('SELECT id, email, name, role, department, status FROM users ORDER BY name')) {
        return {
          all: () => users
            .map(({ password_hash: _ignored, ...u }) => u)
            .sort((a, b) => a.name.localeCompare(b.name))
        };
      }

      if (query.startsWith('SELECT id, email, name, role, department, status FROM users WHERE id = ?')) {
        return {
          get: (id: string) => {
            const user = users.find((u) => u.id === id);
            if (!user) return undefined;
            const { password_hash: _ignored, ...safe } = user;
            return safe;
          }
        };
      }

      if (query.startsWith('SELECT id, email, name, role, department, status FROM users WHERE email = ?')) {
        return {
          get: (email: string) => {
            const user = users.find((u) => u.email === email);
            if (!user) return undefined;
            const { password_hash: _ignored, ...safe } = user;
            return safe;
          }
        };
      }

      if (query.startsWith('UPDATE users SET ')) {
        return {
          run: (...args: any[]) => {
            const id = args[args.length - 1];
            const user = users.find((u) => u.id === id);
            if (!user) return { changes: 0 };

            if (query.includes('password_hash = ?')) {
              user.password_hash = args[0];
              return { changes: 1 };
            }

            const setClause = query.split('UPDATE users SET ')[1]!.split(', updated_at')[0]!;
            const fields = setClause.split(', ').map((part) => part.split(' = ?')[0]!.trim());
            fields.forEach((field, idx) => {
              user[field] = args[idx];
            });
            return { changes: 1 };
          }
        };
      }

      if (query.startsWith('DELETE FROM users WHERE id = ?')) {
        return {
          run: (id: string) => {
            const before = users.length;
            const index = users.findIndex((u) => u.id === id);
            if (index >= 0) users.splice(index, 1);
            return { changes: users.length < before ? 1 : 0 };
          }
        };
      }

      if (query.startsWith('SELECT 1')) {
        return { get: () => ({ 1: 1 }) };
      }

      throw new Error(`Unexpected query: ${query}`);
    }
  };

  return { getDatabase: () => db };
};

describe('UserService local SQLite mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds a local admin and exposes it via getAll/getByEmail', async () => {
    const service = new UserService({ hashPassword } as any, createSqliteStub());
    await service.initialize();

    const users = await service.getAll();
    expect(users.length).toBeGreaterThan(0);
    expect(users.some(u => u.role === 'ADMIN')).toBe(true);

    const adminEmail = users.find(u => u.role === 'ADMIN')!.email;
    const admin = await service.getByEmail(adminEmail);
    expect(admin?.email).toBe(adminEmail);
  });

  it('supports create, update, delete and password update in local mode', async () => {
    const service = new UserService({ hashPassword } as any, createSqliteStub());
    await service.initialize();

    const created = await service.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'Pass@123456',
      role: 'VIEWER',
      department: 'General'
    });

    expect(created).toBeTruthy();
    expect(created?.email).toBe('test@example.com');

    const updated = await service.update(created!.id, { role: 'MANAGER', department: 'IT' });
    expect(updated?.role).toBe('MANAGER');
    expect(updated?.department).toBe('IT');

    const passwordUpdated = await service.updatePassword(created!.id, 'NewPass@123456');
    expect(passwordUpdated).toBe(true);

    const deleted = await service.delete(created!.id);
    expect(deleted).toBe(true);

    const missing = await service.getById(created!.id);
    expect(missing).toBeNull();
  });

  it('returns duplicate rejection on create with same email', async () => {
    const service = new UserService({ hashPassword } as any, createSqliteStub());
    await service.initialize();

    await service.create({
      name: 'First',
      email: 'dup@example.com',
      password: 'Pass@123456',
      role: 'VIEWER',
      department: 'General'
    });

    const duplicate = await service.create({
      name: 'Second',
      email: 'dup@example.com',
      password: 'Pass@123456',
      role: 'VIEWER',
      department: 'General'
    });

    expect(duplicate).toBeNull();
  });

  it('throws when no storage backend is available', () => {
    expect(() => new UserService({ hashPassword } as any)).toThrow(/FATAL:/);
  });
});
