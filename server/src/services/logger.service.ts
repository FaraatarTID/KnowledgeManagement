export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;

  static setLevel(level: LogLevel) {
    this.level = level;
  }

  private static log(level: LogLevel, levelStr: string, message: string, meta: any = {}) {
    if (level < this.level) return;

    const payload = {
      timestamp: new Date().toISOString(),
      level: levelStr,
      message,
      ...meta,
    };

    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(payload));
    } else {
      const colorMap: any = {
        DEBUG: '\x1b[36m', // Cyan
        INFO: '\x1b[32m',  // Green
        WARN: '\x1b[33m',  // Yellow
        ERROR: '\x1b[31m', // Red
      };
      const reset = '\x1b[0m';
      console.log(`${colorMap[levelStr]}${payload.timestamp} [${levelStr}] ${message}${reset}`, Object.keys(meta).length ? meta : '');
    }
  }

  static debug(message: string, meta?: any) { this.log(LogLevel.DEBUG, 'DEBUG', message, meta); }
  static info(message: string, meta?: any) { this.log(LogLevel.INFO, 'INFO', message, meta); }
  static warn(message: string, meta?: any) { this.log(LogLevel.WARN, 'WARN', message, meta); }
  static error(message: string, meta?: any) { this.log(LogLevel.ERROR, 'ERROR', message, meta); }
}
