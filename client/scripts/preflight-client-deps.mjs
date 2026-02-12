#!/usr/bin/env node
import { execSync } from 'node:child_process';

const strictMode = process.argv.includes('--strict');

function checkPackageAccess(pkg) {
  try {
    execSync(`npm view ${pkg} version --silent`, {
      stdio: 'pipe',
      env: { ...process.env, npm_config_loglevel: 'error' }
    });
    return true;
  } catch {
    return false;
  }
}

const requiredPackages = ['react', 'react-dom', 'next', 'eslint', 'vitest'];
const blocked = requiredPackages.filter((pkg) => !checkPackageAccess(pkg));

if (blocked.length === 0) {
  console.log('Client dependency preflight passed.');
  process.exit(0);
}

console.warn('Client dependency preflight warning: blocked packages detected:', blocked.join(', '));
console.warn('Action: allow these packages in your registry/security policy, then run `npm install --prefix client`.');
console.warn('Impact: client install/build/lint/test cannot be fully validated in this environment.');

if (strictMode) {
  console.error('Strict mode enabled: failing preflight due blocked package access.');
  process.exit(2);
}

process.exit(0);
