import { SupabaseClient } from '@supabase/supabase-js';
import { Logger } from './logger.js';

/**
 * Connection pool wrapper for Supabase to prevent resource exhaustion
 * Manages a queue of pending requests and limits concurrent connections
 */
export class SupabaseConnectionPool {
  private pendingRequests: Array<() => Promise<any>> = [];
  private activeConnections: number = 0;
  private maxConnections: number;
  private idleTimeout: number;
  private requestTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    private client: SupabaseClient,
    options: {
      maxConnections?: number;
      idleTimeout?: number;
    } = {}
  ) {
    this.maxConnections = options.maxConnections || 10;
    this.idleTimeout = options.idleTimeout || 3000;

    Logger.info('SupabaseConnectionPool: Initialized', {
      maxConnections: this.maxConnections,
      idleTimeout: this.idleTimeout
    });
  }

  /**
   * Wraps a Supabase query with connection pooling
   */
  async execute<T>(
    operation: () => Promise<T>,
    operationId: string = 'unknown'
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          this.activeConnections++;
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeConnections--;
          this.processQueue();
        }
      };

      // If we have capacity, execute immediately
      if (this.activeConnections < this.maxConnections) {
        task();
      } else {
        // Queue the request
        this.pendingRequests.push(task);
        
        // Add timeout to prevent indefinite queueing
        const timeoutId = setTimeout(() => {
          const index = this.pendingRequests.indexOf(task);
          if (index > -1) {
            this.pendingRequests.splice(index, 1);
            reject(new Error(`Operation ${operationId} timed out waiting in connection pool queue`));
          }
        }, this.idleTimeout);

        this.requestTimeouts.set(operationId, timeoutId);
      }
    });
  }

  /**
   * Process queued requests when capacity becomes available
   */
  private processQueue(): void {
    if (this.pendingRequests.length > 0 && this.activeConnections < this.maxConnections) {
      const task = this.pendingRequests.shift();
      if (task) {
        task();
      }
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats() {
    return {
      activeConnections: this.activeConnections,
      queuedRequests: this.pendingRequests.length,
      maxConnections: this.maxConnections,
      utilization: `${((this.activeConnections / this.maxConnections) * 100).toFixed(1)}%`
    };
  }

  /**
   * Clear timeouts on shutdown
   */
  destroy(): void {
    this.requestTimeouts.forEach(timeout => clearTimeout(timeout));
    this.requestTimeouts.clear();
    this.pendingRequests = [];
    Logger.info('SupabaseConnectionPool: Destroyed');
  }
}

/**
 * Create a pooled Supabase client wrapper
 */
export function createPooledSupabaseClient(
  client: SupabaseClient,
  maxConnections: number = 10
): SupabaseClient & { getPoolStats: () => any } {
  const pool = new SupabaseConnectionPool(client, {
    maxConnections,
    idleTimeout: 3000
  });

  // Wrap client methods to use pooling
  const wrappedClient = new Proxy(client, {
    get: (target: any, prop: string | symbol) => {
      if (prop === 'getPoolStats') {
        return () => pool.getStats();
      }
      if (prop === 'from') {
        return (table: string) => {
          const query = target.from(table);
          // Wrap query builder methods
          return new Proxy(query, {
            get: (queryTarget: any, queryProp: string | symbol) => {
              if (typeof queryTarget[queryProp as string] === 'function') {
                return (...args: any[]) => {
                  const result = queryTarget[queryProp as string](...args);
                  
                  // Intercept promise-like methods (select, insert, update, delete)
                  if (
                    queryProp === 'select' ||
                    queryProp === 'insert' ||
                    queryProp === 'update' ||
                    queryProp === 'delete' ||
                    queryProp === 'single' ||
                    queryProp === 'maybeSingle'
                  ) {
                    // Return wrapped promise with pooling
                    return {
                      then: (onFulfilled: any, onRejected: any) => {
                        return pool
                          .execute(
                            () => result.then(onFulfilled, onRejected),
                            `${table}.${String(queryProp)}`
                          )
                          .then(onFulfilled, onRejected);
                      },
                      catch: (onRejected: any) => {
                        return pool.execute(
                          () => result.catch(onRejected),
                          `${table}.${String(queryProp)}`
                        );
                      }
                    };
                  }
                  
                  return result;
                };
              }
              return queryTarget[queryProp as string];
            }
          });
        };
      }
      return target[prop as string];
    }
  });

  return wrappedClient as any;
}
