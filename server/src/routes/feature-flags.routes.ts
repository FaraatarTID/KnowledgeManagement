import { Router } from 'express';
import type { Request, Response } from 'express';
import { featureFlags } from '../utils/feature-flags.js';

/**
 * Feature Flags Admin API
 * 
 * Endpoints for managing feature flags at runtime.
 * Protected to admin users only.
 */

export const featureFlagsRouter = Router();

/**
 * GET /admin/feature-flags
 * Get all feature flags
 */
featureFlagsRouter.get('/', (req: Request, res: Response) => {
  try {
    const flags = featureFlags.getAll();
    res.json({
      success: true,
      count: flags.length,
      flags
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/feature-flags/:name
 * Get specific flag
 */
featureFlagsRouter.get('/:name', (req: Request, res: Response) => {
  try {
    const flagName = req.params.name as string;
    const flag = featureFlags.getFlag(flagName);

    if (!flag) {
      return res.status(404).json({
        success: false,
        error: `Feature flag not found: ${req.params.name}`
      });
    }

    res.json({
      success: true,
      flag
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/feature-flags/:name
 * Update feature flag
 */
featureFlagsRouter.post('/:name', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id || 'anonymous';
    const updates = req.body;

    // Validate updates
    if (updates.rolloutPercentage !== undefined) {
      if (typeof updates.rolloutPercentage !== 'number' || updates.rolloutPercentage < 0 || updates.rolloutPercentage > 100) {
        return res.status(400).json({
          success: false,
          error: 'rolloutPercentage must be a number between 0 and 100'
        });
      }
    }

    const flagName = req.params.name as string;
    const flag = await featureFlags.updateFlag(flagName, updates, userId);

    res.json({
      success: true,
      message: `Feature flag "${req.params.name}" updated`,
      flag
    });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/feature-flags/:name/status
 * Check flag status for specific user
 */
featureFlagsRouter.get('/:name/status', (req: Request, res: Response) => {
  try {
    const flagName = req.params.name as string;
    const userId = req.query.userId as string | undefined;
    const environment = (req.query.env as string) || process.env.NODE_ENV || 'development';

    const flag = featureFlags.getFlag(flagName);
    if (!flag) {
      return res.status(404).json({
        success: false,
        error: `Feature flag not found: ${flagName}`
      });
    }

    const enabled = featureFlags.isEnabled(flagName as string, userId, environment);

    // Determine reason
    let reason = '';
    if (!flag.enabled) {
      reason = 'Flag globally disabled';
    } else if (flag.targetEnvironments && !flag.targetEnvironments.includes(environment as any)) {
      reason = `Environment "${environment}" not in target environments`;
    } else if (userId && flag.excludeUsers?.includes(userId)) {
      reason = `User "${userId}" explicitly excluded`;
    } else if (userId && flag.targetUsers?.includes(userId)) {
      reason = `User "${userId}" explicitly included`;
    } else if (userId && flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      const hash = Math.abs(userId.split('').reduce((h, c) => ((h << 5) - h) + c.charCodeAt(0), 0));
      const inRollout = (hash % 100) < flag.rolloutPercentage;
      reason = `User hash ${hash % 100}% ${inRollout ? 'within' : 'outside'} rollout percentage ${flag.rolloutPercentage}%`;
    } else {
      reason = 'Matches default enabled state';
    }

    res.json({
      success: true,
      flagName,
      userId: userId || 'anonymous',
      environment,
      enabled,
      reason,
      flag
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/feature-flags/:name/evaluate
 * Evaluate flags for user (bulk check)
 */
featureFlagsRouter.post('/:name/evaluate', (req: Request, res: Response) => {
  try {
    const { userId, environment } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const flags = featureFlags.evaluateFlags(userId, environment);

    res.json({
      success: true,
      userId,
      environment: environment || process.env.NODE_ENV,
      flags
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/feature-flags/:name/rollout
 * Start gradual rollout
 */
featureFlagsRouter.post('/:name/rollout', async (req: Request, res: Response) => {
  try {
    const { steps = [10, 25, 50, 75, 100], intervalMinutes = 60 } = req.body;
    const userId = (req as any).user?.id || 'system';

    if (!Array.isArray(steps) || !steps.every(s => typeof s === 'number' && s >= 0 && s <= 100)) {
      return res.status(400).json({
        success: false,
        error: 'steps must be array of numbers between 0-100'
      });
    }

    // Start rollout in background
    featureFlags.gradualRollout(req.params.name as string, steps, intervalMinutes).catch((err: any) => {
      console.error(`Gradual rollout failed for ${req.params.name}:`, err);
    });

    res.json({
      success: true,
      message: `Gradual rollout started for "${req.params.name}"`,
      plan: {
        steps,
        intervalMinutes,
        estimatedCompletionMinutes: (steps.length - 1) * intervalMinutes
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /admin/feature-flags/:name/adoption
 * Get adoption statistics
 */
featureFlagsRouter.get('/:name/adoption', (req: Request, res: Response) => {
  try {
    const sampleSize = parseInt(req.query.sampleSize as string) || 10000;
    const stats = featureFlags.getAdoptionStats(req.params.name as string, sampleSize);

    res.json({
      success: true,
      flagName: req.params.name,
      sampleSize,
      stats
    });
  } catch (error: any) {
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /admin/feature-flags/health
 * Feature flags system health check
 */
featureFlagsRouter.get('/health/status', (req: Request, res: Response) => {
  try {
    const health = featureFlags.getHealthStatus();

    res.json({
      success: true,
      health,
      healthy: health.loaded && health.flagCount > 0
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default featureFlagsRouter;
