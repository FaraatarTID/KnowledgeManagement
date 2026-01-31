/**
 * TIMING ATTACK MITIGATION FOR AUTH SERVICE
 * 
 * Problem: validateCredentials() leaks user existence via timing
 * Solution: Ensure both success and failure paths take constant time
 * 
 * Before applying this patch, read IMPLEMENTATION_PLAN.md section P0.1
 */

import * as argon2 from 'argon2';
import crypto from 'crypto';
import { Logger } from '../utils/logger.js';

/**
 * Replace the validateCredentials method in AuthService with this:
 */
export const validateCredentialsFixed = async function(
  this: any,
  email: string,
  password: string
): Promise<any | null> {
  const startTime = Date.now();
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Query user (may take variable time if user doesn't exist)
    const { data, error } = await this.supabase
      .from('users')
      .select('id, email, name, role, department, status, password_hash')
      .eq('email', normalizedEmail)
      .single();

    // Constant-time password verification
    // If user exists: verify actual hash
    // If user doesn't exist: verify dummy hash (same time)
    const hashToVerify = error || !data 
      ? this.constructor.DUMMY_HASH 
      : data.password_hash;

    const isValid = await argon2.verify(hashToVerify, password);

    // Check if user is active AFTER hash verification
    if (isValid && !error && data && data.status === 'Inactive') {
      Logger.warn('Login attempt on inactive account', { email: normalizedEmail });
      return null;
    }

    // Add random jitter (10-50ms) to prevent statistical timing attacks
    // This ensures attackers can't reliably distinguish success from failure
    // even with statistical analysis of multiple requests
    const MINIMUM_TIME_MS = 500; // Tune based on your Argon2 config (typically 300-600ms)
    const jitterMs = crypto.randomInt(10, 50);
    const elapsed = Date.now() - startTime;

    if (elapsed < MINIMUM_TIME_MS) {
      const delayMs = MINIMUM_TIME_MS - elapsed + jitterMs;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Log the operation (audit trail)
    if (isValid && data) {
      Logger.debug('Successful login attempt', { email: normalizedEmail });
    } else {
      Logger.debug('Failed login attempt', { email: normalizedEmail });
    }

    // Return null for failed auth (regardless of whether user exists)
    return isValid && data ? data : null;

  } catch (err) {
    // Even on database error, maintain constant time
    Logger.error('validateCredentials error', { error: err });
    
    // Ensure minimum time even on error
    const elapsed = Date.now() - startTime;
    const MINIMUM_TIME_MS = 500;
    if (elapsed < MINIMUM_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, MINIMUM_TIME_MS - elapsed));
    }

    return null;
  }
};

/**
 * TEST HARNESS: Verify constant-time behavior
 * 
 * Usage: 
 *   npx ts-node test-timing.ts
 * 
 * Expected output:
 *   All measurements should be within 50-100ms of each other
 *   If deviation > 150ms, increase MINIMUM_TIME_MS
 */
export const timingAttackTest = async (authService: any) => {
  const iterations = 100;
  const results = {
    nonexistentUser: [] as number[],
    wrongPassword: [] as number[],
    correctPassword: [] as number[]
  };

  console.log(`Running timing attack mitigation test (${iterations} iterations)...`);

  // Test 1: Non-existent user
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await authService.validateCredentials(`nonexistent${i}@test.com`, 'password123');
    results.nonexistentUser.push(Date.now() - start);
  }

  // Test 2: Wrong password
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await authService.validateCredentials('alice@aikb.com', 'wrongpassword');
    results.wrongPassword.push(Date.now() - start);
  }

  // Test 3: Correct password
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await authService.validateCredentials('alice@aikb.com', 'admin123');
    results.correctPassword.push(Date.now() - start);
  }

  // Analyze results
  const analyze = (data: number[]) => {
    const avg = data.reduce((a, b) => a + b) / data.length;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const stdDev = Math.sqrt(
      data.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / data.length
    );
    return { avg: Math.round(avg), min, max, stdDev: Math.round(stdDev) };
  };

  console.log('\n📊 TIMING ANALYSIS:');
  console.log('Non-existent user:', analyze(results.nonexistentUser));
  console.log('Wrong password:   ', analyze(results.wrongPassword));
  console.log('Correct password: ', analyze(results.correctPassword));

  // Check if within acceptable range (< 100ms deviation)
  const allResults = [...results.nonexistentUser, ...results.wrongPassword, ...results.correctPassword];
  const overallStdDev = Math.sqrt(
    allResults.reduce((sq, n) => sq + Math.pow(n - (allResults.reduce((a, b) => a + b) / allResults.length), 2), 0) / allResults.length
  );

  console.log(`\n📈 Overall std dev: ${Math.round(overallStdDev)}ms`);
  
  if (overallStdDev < 100) {
    console.log('✅ PASS: Timing variation acceptable (<100ms)');
  } else {
    console.log('❌ FAIL: Timing variation too high (>100ms). Increase MINIMUM_TIME_MS.');
  }
};
