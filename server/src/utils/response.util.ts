import { Logger } from './logger.js';

/**
 * Standard API response envelope for all endpoints.
 * Ensures consistent response structure across entire API.
 */
export interface ApiResponse<T> {
  success: boolean;
  status: number; // HTTP status code
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata?: {
    timestamp: number;
    requestId: string;
    path?: string;
    method?: string;
    duration?: number;
  };
}

/**
 * Standard error codes for API responses.
 */
export enum ErrorCode {
  // 400s - Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  TIMEOUT = 'TIMEOUT',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // 500s - Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  
  // Custom business errors
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT'
}

/**
 * HTTP status code mapping for error codes.
 */
const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.TIMEOUT]: 408,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INTERNAL_SERVER_ERROR]: 500,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.AUTHENTICATION_FAILED]: 401,
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.ACCOUNT_LOCKED]: 423,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCode.RESOURCE_EXHAUSTED]: 429,
  [ErrorCode.OPERATION_TIMEOUT]: 408
};

/**
 * Response builder utility for constructing standardized responses.
 * Usage: 
 *   ApiResponseBuilder.success(data, 200)
 *   ApiResponseBuilder.error(ErrorCode.NOT_FOUND, 'Resource not found')
 */
export class ApiResponseBuilder {
  /**
   * Build success response.
   */
  static success<T>(
    data: T,
    status: number = 200,
    metadata?: Record<string, any>
  ): ApiResponse<T> {
    return {
      success: true,
      status,
      data,
      metadata: {
        timestamp: Date.now(),
        requestId: this.generateRequestId(),
        ...metadata
      }
    };
  }

  /**
   * Build error response.
   */
  static error(
    code: ErrorCode,
    message: string,
    details?: Record<string, any>
  ): ApiResponse<never> {
    const status = ERROR_STATUS_MAP[code] || 500;

    return {
      success: false,
      status,
      error: {
        code,
        message,
        ...(details && { details })
      },
      metadata: {
        timestamp: Date.now(),
        requestId: this.generateRequestId()
      }
    };
  }

  /**
   * Build error from Error object.
   */
  static fromError(error: Error, defaultCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR): ApiResponse<never> {
    // Try to extract error code from error message
    let code = defaultCode;
    if (error.message.includes('timeout')) {
      code = ErrorCode.OPERATION_TIMEOUT;
    } else if (error.message.includes('unauthorized')) {
      code = ErrorCode.UNAUTHORIZED;
    } else if (error.message.includes('not found')) {
      code = ErrorCode.NOT_FOUND;
    } else if (error.message.includes('forbidden')) {
      code = ErrorCode.FORBIDDEN;
    } else if (error.message.includes('validation')) {
      code = ErrorCode.VALIDATION_ERROR;
    }

    return this.error(code, error.message);
  }

  /**
   * Generate unique request ID for tracing.
   */
  private static generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}

/**
 * Express response helper for sending standardized responses.
 */
export function sendResponse<T>(res: any, response: ApiResponse<T>) {
  return res.status(response.status).json(response);
}

/**
 * Express middleware for request ID tracking and response wrapping.
 */
export function createResponseMiddleware() {
  return (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Store in request for downstream use
    req.requestId = requestId;
    req.startTime = startTime;

    // Wrap res.json to add metadata
    const originalJson = res.json.bind(res);
    res.json = function(data: any) {
      // Add metadata if not already present
      if (data && typeof data === 'object' && !data.metadata) {
        data.metadata = {
          timestamp: Date.now(),
          requestId,
          path: req.path,
          method: req.method,
          duration: Date.now() - startTime
        };
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Wrapper to catch async controller errors and convert to standardized responses.
 */
export function asyncHandler(fn: (req: any, res: any, next: any) => Promise<void>) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(error => {
      Logger.error('Async handler error', {
        error: error instanceof Error ? error.message : String(error),
        path: req.path,
        method: req.method
      });

      const response = ApiResponseBuilder.fromError(
        error instanceof Error ? error : new Error(String(error))
      );

      // Add request metadata
      response.metadata = {
        timestamp: Date.now(),
        requestId: req.requestId || 'unknown',
        path: req.path,
        method: req.method,
        duration: Date.now() - req.startTime
      };

      return res.status(response.status).json(response);
    });
  };
}

/**
 * Validate request parameters against a schema.
 * Returns ApiResponse with validation errors if invalid.
 */
export async function validateRequest<T>(
  data: unknown,
  schema: { parse: (data: unknown) => T }
): Promise<{ valid: true; data: T } | { valid: false; response: ApiResponse<never> }> {
  try {
    const parsed = schema.parse(data);
    return { valid: true, data: parsed };
  } catch (error) {
    const response = ApiResponseBuilder.error(
      ErrorCode.VALIDATION_ERROR,
      'Request validation failed',
      {
        details: error instanceof Error ? error.message : String(error)
      }
    );
    return { valid: false, response };
  }
}
