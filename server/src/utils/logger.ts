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
    this.logger.info(message, { ...meta, ...this.getContext() });
  }

  static warn(message: string, meta?: any) {
    this.logger.warn(message, { ...meta, ...this.getContext() });
  }

  static error(message: string, meta?: any) {
    this.logger.error(message, { ...meta, ...this.getContext() });
  }

  static debug(message: string, meta?: any) {
    this.logger.debug(message, { ...meta, ...this.getContext() });
  }
}
