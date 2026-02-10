import { Logger } from './logger.js';

interface TimeoutConfig {
  name: string;
  timeoutMs: number;
  onTimeout?: () => void;
}

/**
 * Timeout wrapper for promises.
 * Rejects with TimeoutError after specified duration.
 * Useful for preventing operations from hanging indefinitely.
 */
export class TimeoutUtil {
  /**
   * Wrap a promise with a timeout.
   * Rejects if promise doesn't settle within timeoutMs.
   */
  static timeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    name: string = 'Operation'
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const guardedPromise = promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        return value;
      },
      (error) => {
        if (timer) clearTimeout(timer);
        throw error;
      }
    );

    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        const error = new TimeoutError(
          `${name} exceeded timeout of ${timeoutMs}ms`
        );
        Logger.warn(`${name}: Timeout exceeded`, {
          timeoutMs,
          name
        });
        reject(error);
      }, timeoutMs);
    });

    return Promise.race([guardedPromise, timeoutPromise]);
  }

  /**
   * Execute function with timeout.
   * Automatically handles rejection and logging.
   */
  static async execute<T>(
    fn: () => Promise<T>,
    config: TimeoutConfig
  ): Promise<T> {
    try {
      return await this.timeout(fn(), config.timeoutMs, config.name);
    } catch (error) {
      if (config.onTimeout && error instanceof TimeoutError) {
        config.onTimeout();
      }
      throw error;
    }
  }

  /**
   * Create a deadline (absolute time) wrapper.
   * Useful for operations that must complete by a certain time.
   */
  static deadline<T>(
    promise: Promise<T>,
    deadlineMs: number,
    name: string = 'Operation'
  ): Promise<T> {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) {
      return Promise.reject(
        new TimeoutError(`${name} deadline already exceeded`)
      );
    }
    return this.timeout(promise, remaining, name);
  }

  /**
   * Race multiple operations with timeout and return first to succeed.
   */
  static async raceWithTimeout<T>(
    operations: Array<{ fn: () => Promise<T>; name: string }>,
    timeoutMs: number
  ): Promise<{ result: T; winner: string }> {
    const promises = operations.map(op =>
      this.timeout(op.fn(), timeoutMs, op.name).then(result => ({
        result,
        winner: op.name
      }))
    );

    return Promise.race(promises);
  }
}

/**
 * Custom error for timeout violations.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * HTTP Request timeout configuration.
 * Default timeouts for different operation types.
 */
export const REQUEST_TIMEOUTS = {
  // Fast operations
  HEALTH_CHECK: 5000,
  CACHE_LOOKUP: 500,
  
  // Standard operations
  VECTOR_SEARCH: 15000,
  EMBEDDING_GENERATION: 30000,
  METADATA_FETCH: 5000,
  
  // Slow operations
  DOCUMENT_UPLOAD: 120000, // 2 minutes for large uploads
  RAG_QUERY: 60000, // 1 minute for full RAG pipeline
  BATCH_OPERATION: 180000, // 3 minutes for batch operations
  
  // Default
  DEFAULT: 30000
};

/**
 * Middleware for Express to set request deadlines.
 */
export function createDeadlineMiddleware(defaultTimeoutMs = REQUEST_TIMEOUTS.DEFAULT) {
  return (req: any, res: any, next: any) => {
    // Set deadline on request for downstream operations
    const deadline = Date.now() + defaultTimeoutMs;
    (req as any).deadline = deadline;
    (req as any).timeoutMs = defaultTimeoutMs;

    // Also set socket timeout
    req.socket.setTimeout(defaultTimeoutMs + 1000); // Add buffer

    next();
  };
}

/**
 * Utility to check if operation should continue based on deadline.
 */
export function checkDeadline(deadline: number, operation: string): boolean {
  const remaining = deadline - Date.now();
  
  if (remaining <= 100) { // Leave 100ms buffer
    Logger.warn(`${operation}: Approaching deadline`, {
      remainingMs: remaining
    });
    return false;
  }
  
  return true;
}
