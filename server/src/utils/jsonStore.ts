import fs from 'fs';
import path from 'path';
import { Mutex } from './mutex.js';

/**
 * Universal Atomic JSON Storage Utility.
 * Provides thread-safe, crash-resistant persistence using the write-then-rename pattern.
 */
export class JSONStore<T> {
  private memoryState: T;
  private readonly mutex = new Mutex();
  private readonly backupPath: string;
  private readonly tempPath: string;

  constructor(
    private readonly storagePath: string,
    private readonly defaultState: T
  ) {
    this.memoryState = defaultState;
    this.backupPath = `${storagePath}.bak`;
    this.tempPath = `${storagePath}.tmp`;
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        this.memoryState = JSON.parse(data);
      } else if (fs.existsSync(this.backupPath)) {
        console.warn(`JSONStore: Main file missing at ${this.storagePath}, recovering from backup.`);
        fs.copyFileSync(this.backupPath, this.storagePath);
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        this.memoryState = JSON.parse(data);
      } else {
        fs.writeFileSync(this.storagePath, JSON.stringify(this.defaultState, null, 2));
      }
    } catch (e) {
      console.error(`JSONStore: Critical failure initializing ${this.storagePath}`, e);
      this.memoryState = this.defaultState;
    }
  }

  /**
   * Safe read of current state (returns a shallow copy if object/array)
   */
  get state(): T {
    if (Array.isArray(this.memoryState)) return [...this.memoryState] as any;
    if (typeof this.memoryState === 'object' && this.memoryState !== null) return { ...this.memoryState };
    return this.memoryState;
  }

  /**
   * Updates state through a transformation function and persists atomically.
   * Uses Shadow-Copy pattern for transactional safety.
   */
  async update(fn: (current: T) => T | Promise<T>): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      // 1. Generate new state (Shadow Copy)
      const currentState = this.state;
      const newState = await fn(currentState);

      // 2. Persist to temp file
      await fs.promises.writeFile(this.tempPath, JSON.stringify(newState, null, 2), { flag: 'w' });

      // 3. Create backup of current
      if (fs.existsSync(this.storagePath)) {
        await fs.promises.copyFile(this.storagePath, this.backupPath);
      }

      // 4. Atomic swap with retry
      let retries = 3;
      while (retries > 0) {
        try {
          await fs.promises.rename(this.tempPath, this.storagePath);
          break;
        } catch (err: any) {
          if (retries === 1 || (err.code !== 'EPERM' && err.code !== 'EBUSY')) throw err;
          retries--;
          await new Promise(r => setTimeout(r, 50 * (4 - retries)));
        }
      }

      // 5. Commit memory reference
      this.memoryState = newState;

      // 6. Cleanup
      if (fs.existsSync(this.backupPath)) await fs.promises.unlink(this.backupPath).catch(() => {});
    } catch (error) {
      console.error(`JSONStore: Failed to persist ${this.storagePath}`, error);
      if (fs.existsSync(this.tempPath)) await fs.promises.unlink(this.tempPath).catch(() => {});
      throw error;
    } finally {
      release();
    }
  }
}
