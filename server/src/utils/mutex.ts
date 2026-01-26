/**
 * Simple Mutex implementation for preventing race conditions in async environments.
 * Ensures that code blocks are executed sequentially.
 */
export class Mutex {
  private queue: ((releaseFn: () => void) => void)[] = [];
  private locked = false;

  /**
   * Acquire the lock. Returns a release function.
   */
  async acquire(): Promise<() => void> {
    let releaseFn: () => void;

    const p = new Promise<() => void>((resolve) => {
      releaseFn = () => {
        this.locked = false;
        if (this.queue.length > 0) {
          const nextResolve = this.queue.shift()!;
          this.locked = true;
          nextResolve(releaseFn!);
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(releaseFn!);
      } else {
        this.queue.push((r) => resolve(r));
      }
    });

    return p;
  }

  /**
   * Helper to execute a function within the lock.
   */
  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
