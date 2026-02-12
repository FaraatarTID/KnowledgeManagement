#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const normalized = args.flatMap((arg) => {
  if (arg === '--runInBand') {
    return ['--maxWorkers=1'];
  }
  return [arg];
});

const command = process.platform === 'win32' ? 'cmd.exe' : 'npx';
const commandArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx', 'vitest', ...normalized]
  : ['vitest', ...normalized];

const child = spawn(command, commandArgs, {
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
