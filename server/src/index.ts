import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import apiRoutes from "./routes/api.routes.js";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";

import { globalLimiter } from "./middleware/rateLimit.middleware.js";
import morgan from 'morgan';

console.log('--- BACKEND STARTUP SEQUENCE ---');
console.log('Time:', new Date().toISOString());
console.log('CWD:', process.cwd());

const app = express();
const port = process.env.PORT || 3001;

// Global Traffic Logger (replaced by Morgan)
app.use(morgan('combined'));

app.use(helmet());
app.use(cookieParser());
app.use(globalLimiter); // Security: Rate Limiting
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());

import { errorHandler } from "./middleware/error.middleware.js";

// ...

// Main API Mount
app.use("/api/v1", apiRoutes);

// Root Debug Route
app.get("/", (req, res) => {
  res.json({ 
    status: "online", 
    message: "AIKB Backend VERSION 2.0.0",
    docs: "/api/v1/docs"
  });
});

app.get("/health", async (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      api: "ok",
      disk: "pending"
    }
  };

  try {
    // Check disk writeability in data directory
    const testFile = path.join(process.cwd(), 'data', '.healthcheck');
    await fs.promises.writeFile(testFile, Date.now().toString());
    await fs.promises.unlink(testFile);
    health.checks.disk = "ok";
  } catch (e) {
    health.status = "error";
    health.checks.disk = "error";
  }

  res.status(health.status === "ok" ? 200 : 503).json(health);
});

// Centralized Error Handling
app.use(errorHandler);

let server: any;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(port, () => {
    console.log(`✅ SERVER ACTIVE ON PORT ${port}`);
  });
}

// SECURITY: Graceful Shutdown Logic
const shutdown = async (signal: string) => {
  console.log(`\n--- RECEIVED ${signal}: STARTING GRACEFUL SHUTDOWN ---`);
  
  if (server) {
    console.log('Closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed.');
    });
  }

  // Allow 5 seconds for pending async operations (like DB writes)
  console.log('Waiting 5s for pending operations to complete...');
  setTimeout(() => {
    console.log('Finalizing exit...');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
