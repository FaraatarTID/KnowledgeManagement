import winston from 'winston';
import { AsyncContext } from './context.js';

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Structured Logger for Industrial Observability.
 * Automatically attaches Trace IDs requests using AsyncContext.
 * Uses Winston for high-performance, asynchronous logging.
 */
export class Logger {
  private static normalizeMeta(meta: any, depth = 0): any {
    if (depth > 4) return '[Truncated]';
    if (meta instanceof Error) {
      return {
        name: meta.name,
        message: meta.message,
        stack: meta.stack,
      };
    }
    if (Array.isArray(meta)) {
      return meta.map((item) => this.normalizeMeta(item, depth + 1));
    }
    if (meta && typeof meta === 'object') {
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(meta)) {
        normalized[key] = this.normalizeMeta(value, depth + 1);
      }
      return normalized;
    }
    return meta;
  }

  private static logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'knowledge-management-backend' },
    transports: [
      new winston.transports.Console({
        format: process.env.NODE_ENV === 'production'
          ? winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            )
          : winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp(),
              winston.format.printf(({ timestamp, level, message, requestId, ...meta }) => {
                const traceStr = requestId ? `[${requestId}]` : '';
                // Filter out internal Winston properties if any leak
                const cleanMeta = { ...meta };
                delete cleanMeta.service;
                
                const metaStr = Object.keys(cleanMeta).length ? `\n${JSON.stringify(cleanMeta, null, 2)}` : '';
                return `[${timestamp}] ${level} ${traceStr}: ${message}${metaStr}`;
              })
            )
      })
    ]
  });

  private static getContext() {
    // Safely retrieve request ID from AsyncLocalStorage
    return { requestId: AsyncContext.getRequestId() };
  }

  static info(message: string, meta?: any) {
    this.logger.info(message, { ...this.normalizeMeta(meta), ...this.getContext() });
  }

  static warn(message: string, meta?: any) {
    this.logger.warn(message, { ...this.normalizeMeta(meta), ...this.getContext() });
  }

  static error(message: string, meta?: any) {
    this.logger.error(message, { ...this.normalizeMeta(meta), ...this.getContext() });
  }

  static debug(message: string, meta?: any) {
    this.logger.debug(message, { ...this.normalizeMeta(meta), ...this.getContext() });
  }
}
