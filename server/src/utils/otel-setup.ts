/**
 * NOTE: Full OpenTelemetry integration requires installing:
 *   @opentelemetry/api
 *   @opentelemetry/sdk-trace-base
 *   @opentelemetry/resources
 *   @opentelemetry/semantic-conventions
 *   @opentelemetry/instrumentation-*
 *   @opentelemetry/exporter-trace-jaeger (optional)
 *
 * For now, using simplified span tracking without external dependencies.
 */

/**
 * DISTRIBUTED REQUEST TRACING (Simplified Implementation)
 * 
 * Provides basic span tracking and tracing without external OpenTelemetry.
 * Can be upgraded to full OpenTelemetry when packages are installed.
 * 
 * Features:
 * - Span creation and nesting
 * - Trace ID propagation
 * - Span timing and status tracking
 * - Exception recording
 * 
 * Usage:
 *   const result = await withSpan('operation_name', async () => {
 *     // operation
 *   }, { attribute: 'value' });
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
}

export interface Span {
  spanId: string;
  spanName: string;
  traceId: string;
  startTime: number;
  endTime?: number;
  status: 'pending' | 'ok' | 'error';
  statusMessage?: string;
  attributes: Record<string, any>;
  exception?: Error;
  children: Span[];
  parentSpanId?: string;
}

class SimpleTracer {
  private spans: Map<string, Span> = new Map();
  private currentSpan: Span | null = null;

  startSpan(name: string, attributes?: Record<string, any>): Span {
    const traceId = this.getOrCreateTraceId();
    const spanId = this.generateSpanId();

    const span: Span = {
      spanId,
      spanName: name,
      traceId,
      startTime: Date.now(),
      status: 'pending',
      attributes: attributes || {},
      children: [],
      ...(this.currentSpan?.spanId && { parentSpanId: this.currentSpan.spanId })
    };

    this.spans.set(spanId, span);

    if (this.currentSpan) {
      this.currentSpan.children.push(span);
    }

    return span;
  }

  endSpan(span: Span): void {
    span.endTime = Date.now();
    if (span.status === 'pending') {
      span.status = 'ok';
    }
  }

  recordException(span: Span, error: Error): void {
    span.exception = error;
    span.status = 'error';
    span.statusMessage = error.message;
  }

  getTrace(traceId: string): Span[] {
    return Array.from(this.spans.values()).filter(s => s.traceId === traceId);
  }

  private getOrCreateTraceId(): string {
    if (this.currentSpan) {
      return this.currentSpan.traceId;
    }
    return `trace-${this.generateSpanId()}`;
  }

  private generateSpanId(): string {
    return `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

const globalTracer = new SimpleTracer();

export interface OTelConfig {
  serviceName: string;
  environment: string;
  jaegerEndpoint?: string;
  debug?: boolean;
}

/**
 * Initialize tracing (simplified version)
 */
export function initializeOTel(config: OTelConfig): void {
  console.log(`Request tracing initialized for ${config.serviceName}`, {
    environment: config.environment,
    jaegerEndpoint: config.jaegerEndpoint || 'disabled'
  });
}

/**
 * Middleware for Express to extract/inject trace context
 */
export function tracingMiddleware(req: any, res: any, next: any): void {
  // Extract trace context from headers
  const traceId = req.headers['x-trace-id'] || req.headers['traceparent'] || `trace-${Date.now()}`;

  // Create span for this request
  const span = globalTracer.startSpan(`${req.method} ${req.path}`, {
    'http.method': req.method,
    'http.url': req.url,
    'http.target': req.path,
    'http.client_ip': req.ip,
    'http.user_id': req.user?.id || 'anonymous',
    'http.trace_id': traceId
  });

  // Store span in request for child operations
  req._span = span;
  req._traceId = traceId;

  // Inject trace ID into response
  res.setHeader('X-Trace-ID', traceId);

  res.on('finish', () => {
    // Record response details
    span.attributes['http.status_code'] = res.statusCode;
    span.attributes['http.response_content_length'] = res.get('content-length') || 0;

    // Set span status
    if (res.statusCode >= 400) {
      span.status = 'error';
      span.statusMessage = `HTTP ${res.statusCode}`;
    }

    globalTracer.endSpan(span);
  });

  next();
}
