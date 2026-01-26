import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { env } from "./config/env.js";

import { globalLimiter } from "./middleware/rateLimit.middleware.js";
import morgan from 'morgan';

console.log('--- BACKEND STARTUP SEQUENCE ---');
console.log('Time:', new Date().toISOString());
console.log('CWD:', process.cwd());

const app = express();
const port = env.PORT || 3001;

// Global Traffic Logger (replaced by Morgan)
app.use(morgan('combined'));

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
import { vectorService } from "./container.js";
import { Logger } from "./services/logger.service.js";

app.use(sanitizationMiddleware);

Logger.info('--- BACKEND STARTUP SEQUENCE ---', { 
  time: new Date().toISOString(),
  cwd: process.cwd(),
  node_env: env.NODE_ENV
});

// ...

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
  const health = {
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
      disk: "pending"
    }
  };

  try {
    const testFile = path.join(process.cwd(), 'data', '.healthcheck');
    await fs.promises.writeFile(testFile, Date.now().toString());
    await fs.promises.unlink(testFile);
    health.checks.disk = "ok";
  } catch (e) {
    health.status = "error";
    health.checks.disk = "error";
    Logger.error('Health check disk failure', { error: (e as any).message });
  }

  res.status(health.status === "ok" ? 200 : 503).json(health);
});

// Centralized Error Handling
app.use(errorHandler);

let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    Logger.info(`✅ SERVER ACTIVE ON PORT ${port}`);
  });
}

// SECURITY: Graceful Shutdown Logic
const shutdown = async (signal: string) => {
  Logger.warn(`--- RECEIVED ${signal}: STARTING GRACEFUL SHUTDOWN ---`);
  
  if (server) {
    Logger.info('Closing HTTP server...');
    server.close(() => {
      Logger.info('HTTP server closed.');
    });
  }

  // Allow 5 seconds for pending async operations (like DB writes)
  Logger.info('Waiting 5s for pending operations to complete...');
  setTimeout(() => {
    Logger.info('Finalizing exit...');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
