import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '../../../services/user.service.js';

const hashPassword = vi.fn(async (value: string) => `hash:${value}`);

describe('UserService mock mode (test runtime)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('seeds an in-memory admin and exposes it via getAll/getByEmail', async () => {
    const service = new UserService({ hashPassword } as any);
    await service.initialize();

    const users = await service.getAll();
    expect(users.length).toBeGreaterThan(0);
    expect(users.some(u => u.role === 'ADMIN')).toBe(true);

    const adminEmail = users.find(u => u.role === 'ADMIN')!.email;
    const admin = await service.getByEmail(adminEmail);
    expect(admin?.email).toBe(adminEmail);
  });

  it('supports create, update, delete and password update in mock mode', async () => {
    const service = new UserService({ hashPassword } as any);
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
    const service = new UserService({ hashPassword } as any);
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
});
