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
 * Outputs JSON for machine parsing in production, readable text in dev.
 */
export class Logger {
  private static format(level: LogLevel, message: string, meta?: any) {
    const requestId = AsyncContext.getRequestId();
    const timestamp = new Date().toISOString();
    
    // Industrial Standard: JSON Logs
    if (process.env.NODE_ENV === 'production') {
      return JSON.stringify({
        timestamp,
        level,
        requestId,
        message,
        ...meta
      });
    }

    // Developer Experience: Readable Logs
    const traceStr = requestId ? `[${requestId}]` : '';
    const metaStr = meta ? `\n${JSON.stringify(meta, null, 2)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} ${traceStr}: ${message}${metaStr}`;
  }

  static info(message: string, meta?: any) {
    console.log(this.format(LogLevel.INFO, message, meta));
  }

  static warn(message: string, meta?: any) {
    console.warn(this.format(LogLevel.WARN, message, meta));
  }

  static error(message: string, meta?: any) {
    console.error(this.format(LogLevel.ERROR, message, meta));
  }

  static debug(message: string, meta?: any) {
    if (process.env.DEBUG || process.env.NODE_ENV !== 'production') {
      console.debug(this.format(LogLevel.DEBUG, message, meta));
    }
  }
}
