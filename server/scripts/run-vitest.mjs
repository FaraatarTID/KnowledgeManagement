#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const normalized = args.flatMap((arg) => {
  if (arg === '--runInBand') {
    return ['--maxWorkers=1'];
  }
  return [arg];
});

const child = spawn('npx', ['vitest', ...normalized], {
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
