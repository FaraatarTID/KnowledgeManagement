import { EventEmitter } from 'events';

/**
 * FEATURE FLAGS SYSTEM
 * 
 * Enables/disables features per user, environment, or rollout percentage.
 * Supports runtime updates without redeployment.
 * 
 * Usage:
 *   if (featureFlags.isEnabled('priority_1_3_constant_time_auth', userId)) {
 *     // Use constant-time auth
 *   }
 */

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100 (default 100 if enabled=true)
  targetUsers?: string[]; // Specific user IDs to include
  excludeUsers?: string[]; // Specific user IDs to exclude
  targetEnvironments?: ('dev' | 'staging' | 'production')[];
  metadata?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface FeatureFlagChange {
  flagName: string;
  before: FeatureFlag;
  after: FeatureFlag;
  changedAt: Date;
}

/**
 * Feature Flag Manager
 * Thread-safe, Redis-backed with fallback to memory cache
 */
export class FeatureFlagManager extends EventEmitter {
  private memory: Map<string, FeatureFlag> = new Map();
  private redisClient: any; // Would be Redis client in production
  private readonly cacheKeyPrefix = 'feature_flags:';
  private readonly cacheTTL = 5 * 60 * 1000; // 5 minutes
  private lastSync = 0;

  constructor(redisClient?: any) {
    super();
    this.redisClient = redisClient;
    this.initializeDefaultFlags();
  }

  /**
   * Initialize default feature flags for Priority 1 & 2 fixes
   */
  private initializeDefaultFlags(): void {
    const defaultFlags: FeatureFlag[] = [
      {
        name: 'priority_1_1_vector_validation',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Vector service fail-loud validation' }
      },
      {
        name: 'priority_1_3_constant_time_auth',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Authentication constant-time verification (500ms floor)' }
      },
      {
        name: 'priority_1_4_connection_pool',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Supabase connection pooling (max 10)' }
      },
      {
        name: 'priority_1_5_rate_limiter_email',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Email-based rate limiting for auth' }
      },
      {
        name: 'priority_2_1_saga_pattern',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Document upload saga transactions with rollback' }
      },
      {
        name: 'priority_2_2_rbac_api_filtering',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'RBAC filtering at Vertex AI API level' }
      },
      {
        name: 'priority_2_3_error_request_id',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Error request ID linking for tracing' }
      },
      {
        name: 'priority_2_4_cache_invalidation',
        enabled: true,
        rolloutPercentage: 100,
        targetEnvironments: ['staging', 'production'],
        metadata: { description: 'Cache invalidation manager with TTL' }
      }
    ];

    defaultFlags.forEach(flag => {
      this.memory.set(flag.name, {
        ...flag,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });
  }

  /**
   * Check if feature is enabled for user
   * 
   * Decision tree:
   * 1. Not in target environments? → disabled
   * 2. Explicitly excluded? → disabled
   * 3. Explicitly included? → enabled
   * 4. Within rollout percentage? → enabled
   * 5. Default to flag.enabled
   */
  isEnabled(
    featureName: string,
    userId?: string,
    environment: string = process.env.NODE_ENV || 'development'
  ): boolean {
    const flag = this.memory.get(featureName);

    if (!flag) {
      console.warn(`Feature flag not found: ${featureName}, defaulting to false`);
      return false;
    }

    // Check environment
    if (flag.targetEnvironments && !flag.targetEnvironments.includes(environment as any)) {
      return false;
    }

    // Check exclusion list
    if (userId && flag.excludeUsers?.includes(userId)) {
      return false;
    }

    // Check inclusion list
    if (userId && flag.targetUsers?.includes(userId)) {
      return true;
    }

    // Check rollout percentage
    if (userId && flag.rolloutPercentage !== undefined) {
      const hash = this.hashUserId(userId);
      if (hash % 100 >= flag.rolloutPercentage) {
        return false;
      }
    }

    return flag.enabled;
  }

  /**
   * Evaluate all flags for a user
   */
  evaluateFlags(userId: string, environment?: string): Record<string, boolean> {
    const result: Record<string, boolean> = {};

    for (const [flagName] of this.memory) {
      result[flagName] = this.isEnabled(flagName, userId, environment);
    }

    return result;
  }

  /**
   * Get specific flag definition
   */
  getFlag(name: string): FeatureFlag | null {
    return this.memory.get(name) || null;
  }

  /**
   * Get all flags
   */
  getAll(): FeatureFlag[] {
    return Array.from(this.memory.values());
  }

  /**
   * Update flag (with change tracking)
   */
  async updateFlag(
    name: string,
    updates: Partial<FeatureFlag>,
    userId?: string
  ): Promise<FeatureFlag> {
    const existing = this.memory.get(name);

    if (!existing) {
      throw new Error(`Feature flag not found: ${name}`);
    }

    const before = { ...existing };
    const after: FeatureFlag = {
      ...existing,
      ...updates,
      name, // Preserve name
      updatedAt: new Date()
    };

    // Update in memory
    this.memory.set(name, after);

    // Persist to Redis (background, non-blocking)
    if (this.redisClient) {
      this.redisClient.setex(
        `${this.cacheKeyPrefix}${name}`,
        this.cacheTTL / 1000,
        JSON.stringify(after)
      ).catch((err: any) => {
        console.error(`Failed to persist flag ${name} to Redis:`, err);
      });
    }

    // Emit change event
    const change: FeatureFlagChange = {
      flagName: name,
      before,
      after,
      changedAt: new Date()
    };

    this.emit('flag_updated', change);
    console.log(`Feature flag updated: ${name}`, {
      enabledChanged: before.enabled !== after.enabled,
      rolloutPercentageChanged: before.rolloutPercentage !== after.rolloutPercentage,
      by: userId || 'system',
      timestamp: change.changedAt.toISOString()
    });

    return after;
  }

  /**
   * Bulk update multiple flags
   */
  async updateFlags(
    updates: Record<string, Partial<FeatureFlag>>,
    userId?: string
  ): Promise<Record<string, FeatureFlag>> {
    const result: Record<string, FeatureFlag> = {};

    for (const [flagName, flagUpdates] of Object.entries(updates)) {
      result[flagName] = await this.updateFlag(flagName, flagUpdates, userId);
    }

    return result;
  }

  /**
   * Gradual rollout (helper)
   * Increases rollout percentage over time
   */
  async gradualRollout(
    flagName: string,
    steps: number[] = [10, 25, 50, 75, 100],
    intervalMinutes: number = 60
  ): Promise<void> {
    console.log(`Starting gradual rollout for ${flagName}`, {
      steps,
      intervalMinutes
    });

    for (let i = 0; i < steps.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60 * 1000));
      }

      await this.updateFlag(flagName, { rolloutPercentage: steps[i]! }, 'system:gradual_rollout');
      console.log(`Rollout step ${i + 1}/${steps.length}: ${flagName} → ${steps[i]}%`);
    }

    console.log(`Gradual rollout complete: ${flagName}`);
  }

  /**
   * A/B test: split users into two groups
   */
  isInABTestGroup(
    testName: string,
    userId: string,
    controlPercentage: number = 50
  ): 'control' | 'treatment' {
    const hash = this.hashUserId(`${testName}:${userId}`);
    return hash % 100 < controlPercentage ? 'control' : 'treatment';
  }

  /**
   * Get statistics on feature adoption
   */
  getAdoptionStats(flagName: string, sampleSize: number = 10000): {
    approximateEnabledPercentage: number;
    rolloutPercentage: number;
    estimatedEnabledUsers: number;
  } {
    const flag = this.memory.get(flagName);

    if (!flag) {
      throw new Error(`Feature flag not found: ${flagName}`);
    }

    const rolloutPercentage = flag.rolloutPercentage ?? (flag.enabled ? 100 : 0);

    // Simulate sampling
    let enabledCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const userId = `test-${i}`;
      if (this.isEnabled(flagName, userId)) {
        enabledCount++;
      }
    }

    return {
      approximateEnabledPercentage: (enabledCount / sampleSize) * 100,
      rolloutPercentage,
      estimatedEnabledUsers: enabledCount
    };
  }

  /**
   * Health check
   */
  getHealthStatus(): {
    loaded: boolean;
    flagCount: number;
    redisConnected: boolean;
    lastSync: Date;
  } {
    return {
      loaded: this.memory.size > 0,
      flagCount: this.memory.size,
      redisConnected: !!this.redisClient,
      lastSync: new Date(this.lastSync)
    };
  }

  /**
   * Consistent hashing for rollout percentage
   * Same userId always gets same treatment
   */
  private hashUserId(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

// Singleton export
export const featureFlags = new FeatureFlagManager();
