import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

/**
 * Global application context for request tracing.
 * Uses Node.js AsyncLocalStorage to maintain state across async chains.
 */
export class AsyncContext {
  private static storage = new AsyncLocalStorage<Map<string, any>>();

  static run<T>(callback: () => T): T {
    return this.storage.run(new Map(), callback);
  }

  static set(key: string, value: any): void {
    const store = this.storage.getStore();
    if (store) {
      store.set(key, value);
    }
  }

  static get(key: string): any {
    const store = this.storage.getStore();
    return store?.get(key);
  }

  static getRequestId(): string | undefined {
    return this.get('requestId');
  }

  static setRequestId(id: string): void {
    this.set('requestId', id);
  }
}
