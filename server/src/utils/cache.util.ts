import { Logger } from './logger.js';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  hits: number;
  createdAt: number;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: number;
  avgHitsPerEntry: number;
}

/**
 * Simple in-memory LRU cache with TTL support.
 * Useful for caching vector search results, embeddings, and metadata.
 * 
 * Automatically evicts expired entries and least recently used items.
 */
export class CacheUtil<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTtlMs: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 1000, defaultTtlMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get value from cache.
   * Returns null if expired or not found.
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    // Record hit
    entry.hits++;
    this.hits++;

    return entry.data;
  }

  /**
   * Set value in cache with optional TTL.
   */
  set(key: string, data: T, ttlMs?: number): void {
    const expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);

    // If cache is full, evict least recently used (by hits)
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiresAt,
      hits: 0,
      createdAt: Date.now()
    });
  }

  /**
   * Delete specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const avgHits = this.cache.size > 0
      ? Array.from(this.cache.values()).reduce((sum, e) => sum + e.hits, 0) / this.cache.size
      : 0;

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      avgHitsPerEntry: avgHits
    };
  }

  /**
   * Get all entries for debugging.
   */
  entries(): Array<{ key: string; data: T; expiresAt: number; hits: number }> {
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      data: entry.data,
      expiresAt: entry.expiresAt,
      hits: entry.hits
    }));
  }

  /**
   * Clean up expired entries.
   */
  cleanup(): number {
    const before = this.cache.size;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    }

    const removed = before - this.cache.size;
    if (removed > 0) {
      Logger.debug('CacheUtil: Cleaned up expired entries', { removed });
    }

    return removed;
  }

  /**
   * Evict least recently used (LRU) entry.
   * Uses hit count as proxy for recency.
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let minHits = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < minHits) {
        minHits = entry.hits;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      Logger.debug('CacheUtil: Evicted LRU entry', { key: lruKey });
    }
  }
}

/**
 * Specialized cache for vector search results.
 * Key format: `<query_embedding_hash>:<department>:<role>`
 * TTL: 10 minutes (results can become stale)
 */
export class VectorSearchCache extends CacheUtil<Array<{ id: string; score: number; metadata: any }>> {
  constructor() {
    super(500, 10 * 60 * 1000); // 500 entries, 10 minute TTL
  }

  /**
   * Generate cache key from search parameters.
   * Hash first 10 elements of embedding to keep key short.
   */
  static generateKey(embedding: number[], department: string, role: string): string {
    const embeddingHash = embedding
      .slice(0, 10)
      .map(n => Math.round(n * 100))
      .join('-');
    return `vsearch:${embeddingHash}:${department}:${role}`;
  }
}

/**
 * Specialized cache for embeddings.
 * Key: text content
 * TTL: 30 minutes (embeddings don't change)
 */
export class EmbeddingCache extends CacheUtil<number[]> {
  constructor() {
    super(10000, 30 * 60 * 1000); // 10k entries, 30 minute TTL
  }

  /**
   * Generate cache key from text.
   * Simple hash of content.
   */
  static generateKey(text: string): string {
    // Simple hash: sum of character codes modulo large prime
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `embed:${Math.abs(hash)}`;
  }
}

/**
 * Specialized cache for metadata queries.
 * Key: document or query identifier
 * TTL: 5 minutes (metadata updates fairly often)
 */
export class MetadataCache extends CacheUtil<Record<string, any>> {
  constructor() {
    super(2000, 5 * 60 * 1000); // 2k entries, 5 minute TTL
  }

  static generateKey(docId: string): string {
    return `meta:${docId}`;
  }
}
