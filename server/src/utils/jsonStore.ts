import fs from 'fs';
import path from 'path';
import { Mutex } from './mutex.js';

/**
 * Universal Atomic JSON Storage Utility.
 * Provides thread-safe, crash-resistant persistence using the write-then-rename pattern.
 * SHARED LOCKING: Uses a static registry to ensure all instances for the same file share a lock.
 */
export class JSONStore<T> {
  // Path-based Lock Registry to prevent cross-instance collisions
  private static readonly locks = new Map<string, Mutex>();

  private memoryState: T;
  private readonly backupPath: string;
  private readonly tempPath: string;
  private readonly normalizedPath: string;

  constructor(
    private readonly storagePath: string,
    private readonly defaultState: T
  ) {
    this.memoryState = defaultState;
    this.normalizedPath = path.resolve(storagePath);
    this.backupPath = `${storagePath}.bak`;
    this.tempPath = `${storagePath}.tmp`;
    
    // Ensure lock exists for this path
    if (!JSONStore.locks.has(this.normalizedPath)) {
      JSONStore.locks.set(this.normalizedPath, new Mutex());
    }
    
    this.init();
  }

  private get mutex(): Mutex {
    return JSONStore.locks.get(this.normalizedPath)!;
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

      // 3. Create backup of current (Optional but safer)
      if (fs.existsSync(this.storagePath)) {
        await fs.promises.copyFile(this.storagePath, this.backupPath);
      }

      // 4. Atomic swap with retry
      let retries = 5;
      while (retries > 0) {
        try {
          await fs.promises.rename(this.tempPath, this.storagePath);
          break;
        } catch (err: any) {
          if (retries === 1 || (err.code !== 'EPERM' && err.code !== 'EBUSY')) throw err;
          retries--;
          // Jittered backoff to avoid synchronized retries
          await new Promise(r => setTimeout(r, 100 * (6 - retries) + Math.random() * 50));
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
