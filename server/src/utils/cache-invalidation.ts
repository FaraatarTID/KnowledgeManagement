import { Logger } from './logger.js';

/**
 * Cache invalidation manager for distributed cache coordination
 * 
 * Handles invalidation across multiple caches when documents are updated.
 * Uses TTL strategy as fallback (5 minutes default).
 */

export interface CacheInvalidationEvent {
  type: 'document_updated' | 'document_deleted' | 'embeddings_refreshed';
  docId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class CacheInvalidationManager {
  private listeners: Map<string, Array<(event: CacheInvalidationEvent) => Promise<void>>> = new Map();
  private documentTTL: number; // milliseconds

  constructor(documentTTLMinutes: number = 5) {
    this.documentTTL = documentTTLMinutes * 60 * 1000;
    Logger.info('CacheInvalidationManager: Initialized', {
      documentTTLMinutes,
      ttlMs: this.documentTTL
    });
  }

  /**
   * Register a listener for invalidation events
   * Useful for services that cache embeddings, search results, etc.
   */
  on(eventType: string, handler: (event: CacheInvalidationEvent) => Promise<void>): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }

  /**
   * Emit a cache invalidation event
   * All registered listeners will be called
   */
  async emit(event: CacheInvalidationEvent): Promise<void> {
    const handlers = this.listeners.get(event.type) || [];
    
    Logger.debug('CacheInvalidationManager: Emitting event', {
      type: event.type,
      docId: event.docId,
      listeners: handlers.length
    });

    // Execute all listeners in parallel
    const results = await Promise.allSettled(
      handlers.map(handler => handler(event))
    );

    // Log any failures
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        Logger.warn('CacheInvalidationManager: Listener failed', {
          index: idx,
          error: result.reason,
          eventType: event.type
        });
      }
    });
  }

  /**
   * Invalidate document caches immediately
   */
  async invalidateDocument(docId: string): Promise<void> {
    await this.emit({
      type: 'document_updated',
      docId,
      timestamp: new Date()
    });
  }

  /**
   * Invalidate deleted document caches
   */
  async deleteDocument(docId: string): Promise<void> {
    await this.emit({
      type: 'document_deleted',
      docId,
      timestamp: new Date()
    });
  }

  /**
   * Signal that embeddings have been refreshed
   */
  async refreshEmbeddings(docId: string): Promise<void> {
    await this.emit({
      type: 'embeddings_refreshed',
      docId,
      timestamp: new Date()
    });
  }
}

/**
 * TTL-based cache wrapper
 * Automatically expires entries after specified duration
 */
export class TTLCache<K, V> {
  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private ttlMs: number;

  constructor(ttlMinutes: number = 5) {
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  set(key: K, value: V): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(key, { value, expiresAt });
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value;
  }

  delete(key: K): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  /**
   * Delete all keys matching a pattern (e.g., "embedding:doc-123-*")
   */
  deletePattern(pattern: string | RegExp): number {
    let deleted = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace('*', '.*'))
      : pattern;

    for (const key of this.cache.keys()) {
      if (regex.test(String(key))) {
        this.cache.delete(key);
        deleted++;
      }
    }

    return deleted;
  }

  getStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs
    };
  }
}

/**
 * Export singleton instance for application-wide use
 */
export const cacheInvalidation = new CacheInvalidationManager(5); // 5 minute TTL
