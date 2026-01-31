import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import type { User, UserRole, CreateUserDTO } from '../types/user.types.js';

export interface AuthResult {
  user: User;
  token: string;
}

export class AuthService {
  private supabase: SupabaseClient;
  // Pre-calculated hash for timing attack mitigation
  private static readonly DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$745p5p5p5p5p5p5p5p5p5w$p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5';

  constructor() {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      if (env.NODE_ENV === 'test') {
        this.supabase = {} as any;
        return;
      }
      throw new Error('FATAL: Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing. Authentication cannot function.');
    }

    this.supabase = createClient(url, key);
    console.log('AuthService: Supabase client initialized.');
  }

  /**
   * Validates user credentials with constant-time comparison and account lockout.
   * Mitigates timing attacks and brute force by:
   * 1. Always verifying a hash (real or dummy)
   * 2. Adding random jitter (10-50ms) to execution time
   * 3. Maintaining minimum execution time (500ms)
   * 4. Locking account after 5 failed attempts for 15 minutes
   */
  async validateCredentials(email: string, password: string): Promise<User | null> {
    const startTime = Date.now();
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Query user (may take variable time if user doesn't exist)
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status, password_hash, failed_login_attempts, locked_until')
        .eq('email', normalizedEmail)
        .single();

      // Check if account is locked
      if (data && data.locked_until && new Date(data.locked_until) > new Date()) {
        console.log(`AuthService: Login attempt on locked account - ${normalizedEmail}`);
        // Still maintain constant time
        await this.enforceConstantTime(startTime);
        return null;
      }

      // Constant-time password verification
      // If user exists: verify actual hash
      // If user doesn't exist: verify dummy hash (same time)
      const hashToVerify = error || !data 
        ? AuthService.DUMMY_HASH 
        : data.password_hash;

      const isValid = await this.verifyPassword(password, hashToVerify);

      // Check if user is active AFTER hash verification
      if (isValid && !error && data && data.status === 'Inactive') {
        console.log(`AuthService: Login attempt on inactive account - ${normalizedEmail}`);
        await this.enforceConstantTime(startTime);
        return null;
      }

      // Handle failed login - increment attempt counter
      if (!isValid && data) {
        const newAttempts = (data.failed_login_attempts || 0) + 1;
        const updates: any = { failed_login_attempts: newAttempts };

        // Lock account after 5 failed attempts
        if (newAttempts >= 5) {
          const lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
          updates.locked_until = lockUntil.toISOString();
          console.log(`AuthService: Account locked due to failed attempts - ${normalizedEmail}`);
        }

        await this.supabase
          .from('users')
          .update(updates)
          .eq('id', data.id);
      }

      // Handle successful login - reset attempt counter and unlock
      if (isValid && data) {
        await this.supabase
          .from('users')
          .update({ failed_login_attempts: 0, locked_until: null })
          .eq('id', data.id);
        console.log(`AuthService: Successful login - ${normalizedEmail}`);
      } else if (!isValid) {
        console.log(`AuthService: Failed login - ${normalizedEmail}`);
      }

      // Migrate legacy BCrypt hashes to Argon2 (only if auth succeeded)
      if (isValid && data && data.password_hash.startsWith('$2')) {
        console.log(`AuthService: Migrating legacy hash for ${normalizedEmail} to Argon2...`);
        const newHash = await this.hashPassword(password);
        await this.supabase
          .from('users')
          .update({ password_hash: newHash })
          .eq('id', data.id);
      }

      // Enforce constant time delay
      await this.enforceConstantTime(startTime);

      // Return null for failed auth (regardless of whether user exists)
      return isValid && data ? { ...data, password_hash: undefined } as User : null;

    } catch (err) {
      console.error('AuthService: validateCredentials error', err);
      
      // Even on database error, maintain constant time
      await this.enforceConstantTime(startTime);

      return null;
    }
  }

  /**
   * Enforces minimum execution time to prevent timing attacks.
   * Adds 10-50ms jitter to prevent statistical analysis.
   */
  private async enforceConstantTime(startTime: number): Promise<void> {
    const MINIMUM_TIME_MS = 500;
    const jitterMs = crypto.randomInt(10, 50);
    const elapsed = Date.now() - startTime;

    if (elapsed < MINIMUM_TIME_MS) {
      const delayMs = MINIMUM_TIME_MS - elapsed + jitterMs;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Manually unlock a user account (admin operation).
   * Should be protected by authorization checks.
   */
  async unlockAccount(userId: string): Promise<void> {
    try {
      await this.supabase
        .from('users')
        .update({ failed_login_attempts: 0, locked_until: null })
        .eq('id', userId);
      console.log(`AuthService: Account unlocked - ${userId}`);
    } catch (error) {
      console.error('AuthService: Failed to unlock account', { error, userId });
      throw error;
    }
  }

  /**
   * Get account lockout status.
   */
  async getAccountLockoutStatus(email: string): Promise<{ isLocked: boolean; attemptsRemaining: number; lockedUntil?: Date }> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('failed_login_attempts, locked_until')
        .eq('email', email.toLowerCase().trim())
        .single();

      if (error || !data) {
        return { isLocked: false, attemptsRemaining: 5 };
      }

      const now = new Date();
      const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
      const isLocked = lockedUntil && lockedUntil > now;

      // If lockout period has expired, reset
      if (lockedUntil && lockedUntil <= now) {
        await this.supabase
          .from('users')
          .update({ failed_login_attempts: 0, locked_until: null })
          .eq('email', email.toLowerCase().trim());
        return { isLocked: false, attemptsRemaining: 5 };
      }

      return {
        isLocked: !!isLocked,
        attemptsRemaining: Math.max(0, 5 - (data.failed_login_attempts || 0)),
        lockedUntil
      };
    } catch (error) {
      console.error('AuthService: Failed to get lockout status', error);
      return { isLocked: false, attemptsRemaining: 5 };
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
      if (hash.startsWith('$argon2')) {
        return await argon2.verify(hash, password);
      }
      
      // Fallback for legacy BCrypt hashes to support migration
      if (hash.startsWith('$2')) {
        return await bcrypt.compare(password, hash);
      }

      throw new Error('Unsupported password hash format.');
    } catch (error) {
      console.error('AuthService: Password verification failed', error);
      return false;
    }
  }
}
