/**
 * METRICS PERSISTENCE SYSTEM
 * 
 * Stores metrics to InfluxDB for:
 * - Auth response time tracking
 * - Cache hit/miss rates
 * - Error rates per endpoint
 * - Saga transaction completion rates
 * - Rate limiter lockout frequency
 * 
 * In memory buffer with periodic flush (reduces write volume)
 */

export interface MetricsPoint {
  measurement: string;
  tags: Record<string, string>;
  fields: Record<string, number | boolean>;
  timestamp: Date;
}

export class MetricsBuffer {
  private buffer: MetricsPoint[] = [];
  private readonly maxBufferSize = 1000;
  private flushInterval: NodeJS.Timer | null = null;
  private influxDbUrl: string | null = null;
  private influxDbToken: string | null = null;
  private influxDbOrg: string | null = null;
  private influxDbBucket: string | null = null;

  constructor(
    influxDbUrl?: string,
    influxDbToken?: string,
    influxDbOrg?: string,
    influxDbBucket?: string,
    flushIntervalMs: number = 30000 // 30 seconds
  ) {
    this.influxDbUrl = influxDbUrl || null;
    this.influxDbToken = influxDbToken || null;
    this.influxDbOrg = influxDbOrg || null;
    this.influxDbBucket = influxDbBucket || null;

    // Start periodic flush
    if (this.influxDbUrl && this.influxDbToken) {
      this.flushInterval = setInterval(() => {
        this.flush().catch(err => {
          console.error('Metrics: Flush failed', err);
        });
      }, flushIntervalMs);
    }
  }

  /**
   * Record auth timing
   */
  recordAuthTime(
    userId: string,
    durationMs: number,
    success: boolean,
    method: string = 'password'
  ): void {
    this.addPoint({
      measurement: 'auth_duration',
      tags: {
        userId,
        success: success.toString(),
        method
      },
      fields: {
        duration_ms: durationMs,
        success: success ? 1 : 0
      },
      timestamp: new Date()
    });
  }

  /**
   * Record cache operations
   */
  recordCacheOperation(
    operation: 'hit' | 'miss' | 'set' | 'delete' | 'invalidate',
    durationMs: number,
    keyPattern?: string
  ): void {
    this.addPoint({
      measurement: 'cache_operation',
      tags: {
        operation,
        keyPattern: keyPattern || 'unknown'
      },
      fields: {
        duration_ms: durationMs
      },
      timestamp: new Date()
    });
  }

  /**
   * Record cache hit rate
   */
  recordCacheHitRate(hitRate: number, sampleSize: number = 100): void {
    this.addPoint({
      measurement: 'cache_hit_rate',
      tags: {},
      fields: {
        hit_rate_percent: hitRate,
        sample_size: sampleSize
      },
      timestamp: new Date()
    });
  }

  /**
   * Record saga transaction
   */
  recordSagaTransaction(
    transactionId: string,
    durationMs: number,
    status: 'success' | 'compensation' | 'failed',
    stepCount?: number
  ): void {
    this.addPoint({
      measurement: 'saga_transaction',
      tags: {
        transactionId,
        status
      },
      fields: {
        duration_ms: durationMs,
        step_count: stepCount || 0,
        compensated: status === 'compensation' ? 1 : 0
      },
      timestamp: new Date()
    });
  }

  /**
   * Record API error
   */
  recordError(
    endpoint: string,
    errorType: string,
    durationMs: number,
    userId?: string
  ): void {
    this.addPoint({
      measurement: 'api_error',
      tags: {
        endpoint,
        errorType,
        userId: userId || 'anonymous'
      },
      fields: {
        duration_ms: durationMs,
        count: 1
      },
      timestamp: new Date()
    });
  }

  /**
   * Record rate limiter lockout
   */
  recordRateLimitLockout(email: string, reason: string, durationMinutes: number = 15): void {
    this.addPoint({
      measurement: 'rate_limit_lockout',
      tags: {
        email,
        reason
      },
      fields: {
        duration_minutes: durationMinutes,
        count: 1
      },
      timestamp: new Date()
    });
  }

  /**
   * Record connection pool stats
   */
  recordConnectionPoolStats(
    activeConnections: number,
    queuedRequests: number,
    maxConnections: number
  ): void {
    this.addPoint({
      measurement: 'connection_pool',
      tags: {},
      fields: {
        active_connections: activeConnections,
        queued_requests: queuedRequests,
        max_connections: maxConnections,
        utilization_percent: (activeConnections / maxConnections) * 100
      },
      timestamp: new Date()
    });
  }

  /**
   * Record vector search operation
   */
  recordVectorSearch(
    durationMs: number,
    resultCount: number,
    rbacFiltered: number,
    success: boolean
  ): void {
    this.addPoint({
      measurement: 'vector_search',
      tags: {
        success: success.toString()
      },
      fields: {
        duration_ms: durationMs,
        result_count: resultCount,
        rbac_filtered: rbacFiltered,
        filter_percentage: resultCount > 0 ? (rbacFiltered / resultCount) * 100 : 0
      },
      timestamp: new Date()
    });
  }

  /**
   * Record custom metric
   */
  recordCustom(
    measurement: string,
    fields: Record<string, number | boolean>,
    tags?: Record<string, string>
  ): void {
    this.addPoint({
      measurement,
      tags: tags || {},
      fields,
      timestamp: new Date()
    });
  }

  /**
   * Add point to buffer
   */
  private addPoint(point: MetricsPoint): void {
    this.buffer.push(point);

    // Auto-flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush().catch(err => {
        console.error('Metrics: Auto-flush failed', err);
      });
    }
  }

  /**
   * Flush buffer to InfluxDB
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    if (!this.influxDbUrl || !this.influxDbToken) {
      // No InfluxDB configured, clear buffer
      this.buffer = [];
      return;
    }

    try {
      const lineProtocol = this.pointsToLineProtocol(this.buffer);

      const response = await fetch(
        `${this.influxDbUrl}/api/v2/write?org=${this.influxDbOrg}&bucket=${this.influxDbBucket}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${this.influxDbToken}`,
            'Content-Type': 'text/plain'
          },
          body: lineProtocol
        }
      );

      if (!response.ok) {
        throw new Error(`InfluxDB write failed: ${response.statusText}`);
      }

      // Clear buffer on successful flush
      this.buffer = [];
    } catch (err) {
      console.error('Metrics: Failed to flush to InfluxDB', err);
      // Keep buffer for retry next time
    }
  }

  /**
   * Convert points to InfluxDB line protocol format
   */
  private pointsToLineProtocol(points: MetricsPoint[]): string {
    return points.map(point => {
      const tagString = Object.entries(point.tags)
        .map(([k, v]) => `${this.escapeKey(k)}=${this.escapeKey(v)}`)
        .join(',');

      const fieldString = Object.entries(point.fields)
        .map(([k, v]) => {
          if (typeof v === 'boolean') {
            return `${this.escapeKey(k)}=${v ? 'true' : 'false'}`;
          }
          return `${this.escapeKey(k)}=${v}`;
        })
        .join(',');

      const timestamp = point.timestamp.getTime() * 1000000; // nanoseconds

      if (tagString) {
        return `${point.measurement},${tagString} ${fieldString} ${timestamp}`;
      } else {
        return `${point.measurement} ${fieldString} ${timestamp}`;
      }
    }).join('\n');
  }

  /**
   * Escape special characters for line protocol
   */
  private escapeKey(str: string): string {
    return str
      .replace(/\s/g, '\\ ')
      .replace(/,/g, '\\,')
      .replace(/=/g, '\\=');
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }

  /**
   * Shutdown (flush and stop timer)
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval as any);
      this.flushInterval = null;
    }

    // Final flush
    await this.flush();

    console.log('Metrics buffer shutdown complete');
  }
}

// Singleton export
let metricsBuffer: MetricsBuffer | null = null;

export function initializeMetrics(
  influxDbUrl?: string,
  influxDbToken?: string,
  influxDbOrg: string = 'aikb',
  influxDbBucket: string = 'aikb'
): MetricsBuffer {
  metricsBuffer = new MetricsBuffer(
    influxDbUrl,
    influxDbToken,
    influxDbOrg,
    influxDbBucket
  );

  console.log('Metrics system initialized', {
    influxEnabled: !!influxDbUrl,
    org: influxDbOrg,
    bucket: influxDbBucket
  });

  return metricsBuffer;
}

export function getMetrics(): MetricsBuffer {
  if (!metricsBuffer) {
    metricsBuffer = new MetricsBuffer();
  }
  return metricsBuffer;
}

export default {
  initializeMetrics,
  getMetrics,
  MetricsBuffer
};
