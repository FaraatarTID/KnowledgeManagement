import { createClient } from '@supabase/supabase-js';
import * as argon2 from 'argon2';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import type { User, UserRole, CreateUserDTO } from '../types/user.types.js';
import { createPooledSupabaseClient } from '../utils/supabase-pool.js';
import { featureFlags } from '../utils/feature-flags.js';
import { Logger } from '../utils/logger.js';

export interface AuthResult {
  user: User;
  token: string;
}

export class AuthService {
  private supabase: any; // Pooled Supabase client
  private sqlite?: any; // SqliteMetadataService
  private isLocalMode: boolean = false;
  // Pre-calculated hash for timing attack mitigation
  private static readonly DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=1$745p5p5p5p5p5p5p5p5p5w$p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5p5';

  constructor(sqlite?: any) {
    this.sqlite = sqlite;
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key || url === '') {
      if (this.sqlite) {
        this.isLocalMode = true;
        Logger.info('AuthService: Supabase credentials missing. Initialized in LOCAL MODE (SQLite).');
        return;
      }
      
      if (env.NODE_ENV === 'test') {
        this.supabase = {} as any;
        return;
      }
      throw new Error('FATAL: Supabase credentials and Local Storage both unavailable.');
    }

    const baseClient = createClient(url, key);
    // Wrap with connection pooling to prevent resource exhaustion
    this.supabase = createPooledSupabaseClient(baseClient, 10);
    
    Logger.info('AuthService: Supabase client initialized with connection pooling', {
      maxConnections: 10
    });
  }

  /**
   * Validates user credentials with constant-time comparison and account lockout.
   */
  async validateCredentials(email: string, password: string): Promise<User | null> {
    const MIN_EXEC_TIME = 500; // 500ms minimum floor
    const normalizedEmail = email.toLowerCase().trim();
    
    const startTarget = Date.now();
    
    try {
      const randomJitter = crypto.randomInt(10, 50); 
      await new Promise(resolve => setTimeout(resolve, randomJitter));
      
      let userData: any = null;

      if (this.isLocalMode) {
        userData = this.sqlite.getDatabase()
          .prepare('SELECT id, email, name, role, department, status, password_hash, failed_login_attempts, locked_until FROM users WHERE email = ?')
          .get(normalizedEmail);
      } else {
        const { data } = await this.supabase
          .from('users')
          .select('id, email, name, role, department, status, password_hash, failed_login_attempts, locked_until')
          .eq('email', normalizedEmail)
          .single();
        userData = data;
      }

      // Check for lockout
      if (userData && userData.locked_until && new Date(userData.locked_until) > new Date()) {
        await this.verifyPassword(password, AuthService.DUMMY_HASH);
        await this.enforceMinimumTime(startTarget, MIN_EXEC_TIME);
        return null;
      }

      const hashToVerify = !userData ? AuthService.DUMMY_HASH : userData.password_hash;
      const isValid = await this.verifyPassword(password, hashToVerify);

      if (isValid && userData && String(userData.status).toLowerCase() === 'inactive') {
        await this.enforceMinimumTime(startTarget, MIN_EXEC_TIME);
        return null;
      }

      // Handle failure
      if (!isValid && userData) {
        const newAttempts = (userData.failed_login_attempts || 0) + 1;
        const updates: any = { failed_login_attempts: newAttempts };

        if (newAttempts >= 5) {
          updates.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }

        if (this.isLocalMode) {
          this.sqlite.getDatabase()
            .prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?')
            .run(updates.failed_login_attempts, updates.locked_until, userData.id);
        } else {
          await this.supabase.from('users').update(updates).eq('id', userData.id);
        }
      }

      // Handle success
      if (isValid && userData) {
        if (this.isLocalMode) {
           this.sqlite.getDatabase()
             .prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
             .run(userData.id);
        } else {
          await this.supabase.from('users').update({ failed_login_attempts: 0, locked_until: null }).eq('id', userData.id);
        }
      }

      await this.enforceMinimumTime(startTarget, MIN_EXEC_TIME);
      return isValid && userData ? { ...userData, password_hash: undefined } as User : null;

    } catch (err) {
      Logger.error('Auth: validateCredentials error', { error: err });
      await this.enforceMinimumTime(startTarget, MIN_EXEC_TIME);
      return null;
    }
  }

  /**
   * Validates user credentials with constant-time comparison and account lockout.
   * Mitigates timing attacks and brute force by:
   * 1. Adding jitter BEFORE any computation (not after)
   * 2. Maintaining minimum execution time (500ms)
   * 3. Always verifying a hash (real or dummy)
   * 4. Locking account after 5 failed attempts for 15 minutes
   * 
   * CRITICAL FIX: Jitter added at START to prevent statistical timing analysis
   */
  /**
   * Ensures minimum execution time to prevent timing attacks.
   */
  private async enforceMinimumTime(startTime: number, minimumMs: number): Promise<void> {
    const elapsed = Date.now() - startTime;
    if (elapsed < minimumMs) {
      const delayMs = minimumMs - elapsed;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Manually unlock a user account (admin operation).
   */
  async unlockAccount(userId: string): Promise<void> {
    try {
      if (this.isLocalMode) {
        this.sqlite.getDatabase()
          .prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?')
          .run(userId);
      } else {
        await this.supabase
          .from('users')
          .update({ failed_login_attempts: 0, locked_until: null })
          .eq('id', userId);
      }
      Logger.info(`AuthService: Account unlocked - ${userId}`);
    } catch (error) {
      Logger.error('AuthService: Failed to unlock account', { error, userId });
      throw error;
    }
  }

  /**
   * Get account lockout status.
   */
  async getAccountLockoutStatus(email: string): Promise<{ isLocked: boolean; attemptsRemaining: number; lockedUntil?: Date }> {
    try {
      const normalizedEmail = email.toLowerCase().trim();
      let userData: any = null;

      if (this.isLocalMode) {
        userData = this.sqlite.getDatabase()
          .prepare('SELECT failed_login_attempts, locked_until FROM users WHERE email = ?')
          .get(normalizedEmail);
      } else {
        const { data } = await this.supabase
          .from('users')
          .select('failed_login_attempts, locked_until')
          .eq('email', normalizedEmail)
          .single();
        userData = data;
      }

      if (!userData) {
        return { isLocked: false, attemptsRemaining: 5 };
      }

      const now = new Date();
      const lockedUntil = userData.locked_until ? new Date(userData.locked_until) : undefined;
      const isLocked = lockedUntil && lockedUntil > now;

      // If lockout period has expired, reset
      if (lockedUntil && lockedUntil <= now) {
        if (this.isLocalMode) {
          this.sqlite.getDatabase()
            .prepare('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?')
            .run(normalizedEmail);
        } else {
          await this.supabase
            .from('users')
            .update({ failed_login_attempts: 0, locked_until: null })
            .eq('email', normalizedEmail);
        }
        return { isLocked: false, attemptsRemaining: 5 };
      }

      return {
        isLocked: !!isLocked,
        attemptsRemaining: Math.max(0, 5 - (userData.failed_login_attempts || 0)),
        lockedUntil
      } as any;
    } catch (error) {
      Logger.error('AuthService: Failed to get lockout status', error);
      return { isLocked: false, attemptsRemaining: 5 };
    }
  }

  async getUserById(id: string): Promise<User | null> {
    try {
      if (this.isLocalMode) {
        const data = this.sqlite.getDatabase()
          .prepare('SELECT id, email, name, role, department, status FROM users WHERE id = ?')
          .get(id);
        return data as User || null;
      } else {
        const { data, error } = await this.supabase
          .from('users')
          .select('id, email, name, role, department, status')
          .eq('id', id)
          .single();

        if (error || !data) return null;
        return data as User;
      }
    } catch (e) {
      Logger.error('AuthService: getUserById failed', e);
      return null;
    }
  }

  generateToken(user: User): string {
    // SECURITY: Include iat/nbf claims for validation; strict 24h expiry
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        role: user.role, 
        department: user.department,
        iat: now,  // Issued at (verified in middleware)
        nbf: now   // Not before (strict)
      },
      env.JWT_SECRET,
      { 
        expiresIn: '24h',
        algorithm: 'HS256'  // Explicit algorithm to prevent algorithm confusion attacks
      }
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

  /**
   * Fast auth path (without constant-time verification)
   * Used for testing or when feature flag is disabled
   */
  private async validateCredentialsFast(
    normalizedEmail: string,
    password: string
  ): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, email, name, role, department, status, password_hash, failed_login_attempts, locked_until')
        .eq('email', normalizedEmail)
        .single();

      // Check if account is locked
      if (data && data.locked_until && new Date(data.locked_until) > new Date()) {
        Logger.warn(`Auth: Login attempt on locked account - ${normalizedEmail}`);
        return null;
      }

      // Quick password check
      if (!data) {
        return null;
      }

      const isValid = await this.verifyPassword(password, data.password_hash);

      if (!isValid) {
        const newAttempts = (data.failed_login_attempts || 0) + 1;
        const updates: any = { failed_login_attempts: newAttempts };

        if (newAttempts >= 5) {
          updates.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        }

        await this.supabase.from('users').update(updates).eq('id', data.id);
        return null;
      }

      // Reset on success
      await this.supabase
        .from('users')
        .update({ failed_login_attempts: 0, locked_until: null })
        .eq('id', data.id);

      return { ...data, password_hash: undefined } as User;
    } catch (err) {
      Logger.error('Auth: validateCredentialsFast error', { error: err });
      return null;
    }
  }
}
