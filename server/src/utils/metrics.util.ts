import { Logger } from './logger.js';

/**
 * Metrics counter for tracking operation counts and rates.
 */
export interface MetricCounter {
  name: string;
  value: number;
  unit?: string;
  timestamp: number;
}

/**
 * Metrics histogram for tracking response times and distributions.
 */
export interface MetricHistogram {
  name: string;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  count: number;
  unit?: string;
  timestamp: number;
}

/**
 * Application metrics for monitoring performance and health.
 * Tracks requests, errors, cache hits, API calls, etc.
 */
export class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private startTime = Date.now();

  /**
   * Increment a counter by 1 or specified amount.
   */
  increment(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  /**
   * Record a value for a histogram (response time, etc).
   */
  recordHistogram(name: string, value: number): void {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name)!.push(value);
  }

  /**
   * Get counter value.
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get histogram statistics.
   */
  getHistogram(name: string): MetricHistogram | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      name,
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      mean: Math.round(sum / sorted.length),
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      count: sorted.length,
      timestamp: Date.now()
    };
  }

  /**
   * Get all metrics as object.
   */
  getMetrics() {
    const counters: Record<string, number> = {};
    for (const [name, value] of this.counters) {
      counters[name] = value;
    }

    const histograms: Record<string, MetricHistogram | null> = {};
    for (const name of this.histograms.keys()) {
      histograms[name] = this.getHistogram(name);
    }

    return {
      uptime: Date.now() - this.startTime,
      counters,
      histograms,
      timestamp: Date.now()
    };
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.counters.clear();
    this.histograms.clear();
    this.startTime = Date.now();
  }

  /**
   * Export metrics in Prometheus format.
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // Export counters
    for (const [name, value] of this.counters) {
      lines.push(`# HELP ${name} Counter`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${value}`);
    }

    // Export histograms
    for (const name of this.histograms.keys()) {
      const histogram = this.getHistogram(name);
      if (histogram) {
        lines.push(`# HELP ${name} Histogram`);
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_min ${histogram.min}`);
        lines.push(`${name}_max ${histogram.max}`);
        lines.push(`${name}_mean ${histogram.mean}`);
        lines.push(`${name}_p95 ${histogram.p95}`);
        lines.push(`${name}_p99 ${histogram.p99}`);
        lines.push(`${name}_count ${histogram.count}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Global metrics instance (singleton).
 */
export const metrics = new MetricsCollector();

/**
 * Standard metric names for consistent tracking.
 */
export const MetricNames = {
  // Request metrics
  REQUEST_TOTAL: 'http_requests_total',
  REQUEST_DURATION: 'http_request_duration_ms',
  REQUEST_ERROR: 'http_requests_error',
  
  // Service metrics
  RAG_QUERY: 'rag_query_total',
  RAG_QUERY_DURATION: 'rag_query_duration_ms',
  RAG_QUERY_ERROR: 'rag_query_error',
  
  VECTOR_SEARCH: 'vector_search_total',
  VECTOR_SEARCH_DURATION: 'vector_search_duration_ms',
  VECTOR_SEARCH_CACHE_HIT: 'vector_search_cache_hit',
  
  EMBEDDING_GENERATION: 'embedding_generation_total',
  EMBEDDING_GENERATION_DURATION: 'embedding_generation_duration_ms',
  EMBEDDING_CACHE_HIT: 'embedding_cache_hit',
  
  AUTH_ATTEMPT: 'auth_attempt_total',
  AUTH_SUCCESS: 'auth_success_total',
  AUTH_FAILURE: 'auth_failure_total',
  ACCOUNT_LOCKOUT: 'account_lockout_total',
  
  // Cache metrics
  CACHE_HIT: 'cache_hit_total',
  CACHE_MISS: 'cache_miss_total',
  CACHE_EVICTION: 'cache_eviction_total',
  
  // Circuit breaker metrics
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
  CIRCUIT_BREAKER_HALF_OPEN: 'circuit_breaker_half_open',
  
  // Error metrics
  TIMEOUT_ERROR: 'timeout_error_total',
  VALIDATION_ERROR: 'validation_error_total',
  PERMISSION_ERROR: 'permission_error_total'
};

/**
 * Express middleware for request/response metrics.
 */
export function createMetricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    
    metrics.increment(MetricNames.REQUEST_TOTAL);

    // Wrap end() to capture metrics
    const originalEnd = res.end.bind(res);
    res.end = function(...args: any[]) {
      const duration = Date.now() - startTime;
      metrics.recordHistogram(MetricNames.REQUEST_DURATION, duration);

      if (res.statusCode >= 400) {
        metrics.increment(MetricNames.REQUEST_ERROR);
      }

      Logger.debug('Request completed', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration
      });

      return originalEnd(...args);
    };

    next();
  };
}

/**
 * Get current metrics summary.
 */
export function getMetricsSummary() {
  return {
    requests: {
      total: metrics.getCounter(MetricNames.REQUEST_TOTAL),
      errors: metrics.getCounter(MetricNames.REQUEST_ERROR),
      duration: metrics.getHistogram(MetricNames.REQUEST_DURATION)
    },
    rag: {
      total: metrics.getCounter(MetricNames.RAG_QUERY),
      errors: metrics.getCounter(MetricNames.RAG_QUERY_ERROR),
      duration: metrics.getHistogram(MetricNames.RAG_QUERY_DURATION)
    },
    vectors: {
      total: metrics.getCounter(MetricNames.VECTOR_SEARCH),
      cacheHits: metrics.getCounter(MetricNames.VECTOR_SEARCH_CACHE_HIT),
      duration: metrics.getHistogram(MetricNames.VECTOR_SEARCH_DURATION)
    },
    embeddings: {
      total: metrics.getCounter(MetricNames.EMBEDDING_GENERATION),
      cacheHits: metrics.getCounter(MetricNames.EMBEDDING_CACHE_HIT),
      duration: metrics.getHistogram(MetricNames.EMBEDDING_GENERATION_DURATION)
    },
    auth: {
      attempts: metrics.getCounter(MetricNames.AUTH_ATTEMPT),
      successes: metrics.getCounter(MetricNames.AUTH_SUCCESS),
      failures: metrics.getCounter(MetricNames.AUTH_FAILURE),
      lockouts: metrics.getCounter(MetricNames.ACCOUNT_LOCKOUT)
    },
    errors: {
      timeouts: metrics.getCounter(MetricNames.TIMEOUT_ERROR),
      validation: metrics.getCounter(MetricNames.VALIDATION_ERROR),
      permissions: metrics.getCounter(MetricNames.PERMISSION_ERROR)
    }
  };
}
