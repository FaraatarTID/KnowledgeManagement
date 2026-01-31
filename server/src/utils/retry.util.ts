import { Logger } from './logger.js';

interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number; // 0-1, adds random jitter to delay
  timeoutMs?: number; // Timeout per attempt
  name?: string; // For logging
}

interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

/**
 * Implements exponential backoff retry pattern with jitter.
 * Prevents thundering herd by adding randomization to retry delays.
 * 
 * Default: 5 attempts, 100ms initial, 10s max, 2x multiplier, 0.1 jitter
 */
export class RetryUtil {
  /**
   * Execute async function with retry logic.
   * Exponential backoff: delay = min(initialDelay * multiplier^attempt, maxDelay) + jitter
   */
  static async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    const {
      maxAttempts = 5,
      initialDelayMs = 100,
      maxDelayMs = 10000,
      backoffMultiplier = 2,
      jitterFactor = 0.1,
      timeoutMs = 30000,
      name = 'Unknown'
    } = options;

    let lastError: Error | undefined;
    const startTime = Date.now();

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Execute with timeout
        const result = await this.withTimeout(fn(), timeoutMs);
        
        if (attempt > 0) {
          Logger.info(`${name}: Success on attempt ${attempt + 1}/${maxAttempts}`);
        }
        
        return {
          success: true,
          data: result,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry if it's the last attempt
        if (attempt === maxAttempts - 1) {
          Logger.error(`${name}: Failed after ${maxAttempts} attempts`, {
            error: lastError.message
          });
          break;
        }

        // Calculate delay with exponential backoff + jitter
        const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt);
        const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
        const jitter = cappedDelay * jitterFactor * Math.random();
        const delayMs = Math.floor(cappedDelay + jitter);

        Logger.warn(`${name}: Attempt ${attempt + 1} failed, retrying in ${delayMs}ms`, {
          error: lastError.message,
          attempt: attempt + 1,
          maxAttempts
        });

        // Wait before retry
        await this.delay(delayMs);
      }
    }

    return {
      success: false,
      error: lastError || new Error(`${name}: Unknown error after ${maxAttempts} attempts`),
      attempts: maxAttempts,
      totalTimeMs: Date.now() - startTime
    };
  }

  /**
   * Execute with timeout wrapper.
   */
  private static withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timeout after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Sleep for specified milliseconds.
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch retry executor - Execute multiple operations with individual retry logic.
   */
  static async executeBatch<T>(
    operations: Array<{ fn: () => Promise<T>; name: string }>,
    options: RetryOptions = {}
  ): Promise<RetryResult<T>[]> {
    return Promise.all(
      operations.map(op =>
        this.execute(op.fn, { ...options, name: op.name })
      )
    );
  }

  /**
   * Retry with circuit breaker awareness.
   * Skips retry if breaker is OPEN.
   */
  static async executeWithCircuitBreaker<T>(
    fn: () => Promise<T>,
    circuitBreakerCheck: () => boolean, // Returns false if circuit is OPEN
    options: RetryOptions = {}
  ): Promise<RetryResult<T>> {
    if (!circuitBreakerCheck()) {
      return {
        success: false,
        error: new Error('Circuit breaker is OPEN - request rejected'),
        attempts: 0,
        totalTimeMs: 0
      };
    }

    return this.execute(fn, options);
  }
}
