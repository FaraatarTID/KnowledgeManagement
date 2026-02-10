import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { env } from "./config/env.js";

import { globalLimiter } from "./middleware/rateLimit.middleware.js";
import { contextMiddleware } from "./middleware/context.middleware.js";
import { Logger } from "./utils/logger.js";
import { initErrorTracking } from "./utils/error-tracking.js";

Logger.info('--- BACKEND STARTUP SEQUENCE ---', {
  time: new Date().toISOString(),
  cwd: process.cwd(),
  node_env: env.NODE_ENV
});

initErrorTracking();

const app = express();
const port = env.PORT || 3001;

// Observability: Trace Context (Must be first)
app.use(contextMiddleware);

app.use(helmet());
app.use(cookieParser());
app.use(globalLimiter); // Security: Rate Limiting
app.use(cors({
  origin: env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

import { errorHandler } from "./middleware/error.middleware.js";
import { sanitizationMiddleware } from "./middleware/sanitization.middleware.js";
import { 
  vectorService, 
  userService, 
  auditService
} from "./container.js";

app.use(sanitizationMiddleware);

Logger.info('Middleware Stack Initialized');

// Initialize services (e.g., seeding)
userService.initialize().catch(err => Logger.error('UserService initialization failed', { error: err.message }));

// Main API Mount
app.use("/api/v1", apiRoutes);

// Root Debug Route
app.get("/", (req, res) => {
  res.json({ 
    status: "online", 
    version: "2.1.0",
    service: "AIKB Backend"
  });
});

app.get("/health", async (req, res) => {
  const mem = process.memoryUsage();
  const health: any = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    resources: {
      memory: {
        rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
      },
      vectors: await vectorService.getVectorCount()
    },
    checks: {
      api: "ok",
      db: "pending"
    }
  };

  const serviceHealth = await vectorService.checkHealth();
  if (serviceHealth.status === 'ERROR') {
    health.status = 'error';
    health.checks.db = serviceHealth.message || 'unhealthy';
    Logger.error('Health check failed', { error: serviceHealth.message });
  } else {
    health.checks.db = 'ok';
  }

  res.status(health.status === "ok" ? 200 : 503).json(health);
});

// Centralized Error Handling
app.use(errorHandler);

// ============================================================================
// GRACEFUL SHUTDOWN SETUP
// ============================================================================

let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    Logger.info(`✅ SERVER ACTIVE ON PORT ${port}`);
  });

  const setupGracefulShutdown = async (signal: string) => {
    Logger.warn(`\n--- RECEIVED ${signal}: STARTING GRACEFUL SHUTDOWN ---`);
    
    if (server) {
      Logger.info('Closing HTTP server (no new connections accepted)...');
      server.close(async () => {
        try {
          Logger.info('HTTP server closed. Flushing buffers...');

          // Flush audit logs (CRITICAL - prevents data loss)
          // Flush audit logs (CRITICAL - prevents data loss)
          if (auditService?.flush) {
            await auditService.flush();
            Logger.info('✅ Audit logs flushed');
          }

          // Flush vector service if present
          if (vectorService?.flush) {
            await vectorService.flush();
            Logger.info('✅ Vector store flushed');
          }

          Logger.info('🎉 GRACEFUL SHUTDOWN COMPLETE - EXITING');
          process.exit(0);
        } catch (error) {
          Logger.error('❌ Graceful shutdown error:', { error });
          process.exit(1);
        }
      });
    }

    // Force shutdown after timeout (prevent hanging indefinitely)
    setTimeout(() => {
      Logger.error('⏱️  GRACEFUL SHUTDOWN TIMEOUT - FORCING EXIT (pending operations lost)');
      process.exit(1);
    }, 30000); // 30 seconds
  };

  // Register signal handlers
  process.on('SIGTERM', () => setupGracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => setupGracefulShutdown('SIGINT'));

  Logger.info('✅ Graceful shutdown handlers registered');
}

export default app;
