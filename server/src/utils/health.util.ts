import { Logger } from './logger.js';

export interface ServiceHealth {
  name: string;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  responseTimeMs: number;
  error?: string;
  details?: Record<string, any>;
  lastCheckedAt: number;
}

export interface SystemHealth {
  overall: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  timestamp: number;
  uptime: number;
  services: ServiceHealth[];
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
}

/**
 * Health check utility for monitoring service availability.
 * Tracks status, response times, and error rates.
 */
export class HealthCheckUtil {
  private serviceChecks: Map<string, () => Promise<boolean>> = new Map();
  private serviceStatus: Map<string, ServiceHealth> = new Map();
  private startTime = Date.now();

  /**
   * Register a health check function for a service.
   * Function should return true if healthy, false otherwise.
   */
  register(name: string, checkFn: () => Promise<boolean>): void {
    this.serviceChecks.set(name, checkFn);
    this.serviceStatus.set(name, {
      name,
      status: 'UP',
      responseTimeMs: 0,
      lastCheckedAt: 0
    });
  }

  /**
   * Run all registered health checks.
   */
  async checkAll(): Promise<SystemHealth> {
    const checks = Array.from(this.serviceChecks.entries()).map(([name, fn]) =>
      this.check(name, fn)
    );

    const services = await Promise.allSettled(checks);
    const serviceResults: ServiceHealth[] = [];

    services.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        serviceResults.push(result.value);
      } else {
        const names = Array.from(this.serviceChecks.keys());
        const name = names[index] || 'Unknown';
        serviceResults.push({
          name,
          status: 'DOWN',
          responseTimeMs: 0,
          error: String(result.reason),
          lastCheckedAt: Date.now()
        });
      }
    });

    // Update stored status
    serviceResults.forEach(result => {
      this.serviceStatus.set(result.name, result);
    });

    // Determine overall health
    const hasDown = serviceResults.some(s => s.status === 'DOWN');
    const hasDegraded = serviceResults.some(s => s.status === 'DEGRADED');

    const overall = hasDown ? 'UNHEALTHY' : hasDegraded ? 'DEGRADED' : 'HEALTHY';

    const memory = process.memoryUsage();
    return {
      overall,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      services: serviceResults,
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024), // MB
        external: Math.round(memory.external / 1024 / 1024) // MB
      }
    };
  }

  /**
   * Run single health check.
   */
  private async check(name: string, fn: () => Promise<boolean>): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
      const isHealthy = await Promise.race([
        fn(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), 5000)
        )
      ]);

      const responseTimeMs = Date.now() - startTime;
      const status = isHealthy ? 'UP' : 'DEGRADED';

      const health: ServiceHealth = {
        name,
        status,
        responseTimeMs,
        lastCheckedAt: Date.now()
      };

      Logger.debug(`HealthCheck: ${name} is ${status}`, { responseTimeMs });
      return health;
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;

      Logger.warn(`HealthCheck: ${name} check failed`, {
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs
      });

      return {
        name,
        status: 'DOWN',
        responseTimeMs,
        error: error instanceof Error ? error.message : String(error),
        lastCheckedAt: Date.now()
      };
    }
  }

  /**
   * Get current cached status for a service.
   */
  getStatus(name: string): ServiceHealth | undefined {
    return this.serviceStatus.get(name);
  }

  /**
   * Get all cached statuses.
   */
  getAllStatus(): ServiceHealth[] {
    return Array.from(this.serviceStatus.values());
  }

  /**
   * Get uptime in seconds.
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

/**
 * Middleware for Express that adds health check endpoint.
 */
export function createHealthCheckEndpoint(healthCheck: HealthCheckUtil) {
  return async (req: any, res: any) => {
    const health = await healthCheck.checkAll();

    // Set appropriate HTTP status code
    const statusCode = health.overall === 'HEALTHY' ? 200 : health.overall === 'DEGRADED' ? 503 : 503;

    res.status(statusCode).json(health);
  };
}
