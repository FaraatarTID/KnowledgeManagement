/**
 * Security Metrics & Alerting
 * Monitors all critical vulnerability fixes for regressions
 */

interface SecurityMetric {
  name: string;
  value: number;
  threshold: number;
  alert: boolean;
  unit: string;
}

export class SecurityMonitor {
  private metrics: Map<string, SecurityMetric> = new Map();

  recordMetric(name: string, value: number, threshold: number, unit: string = ''): void {
    const alert = value > threshold;
    this.metrics.set(name, { name, value, threshold, alert, unit });

    if (alert) {
      this.sendAlert(name, value, threshold, unit);
    }
  }

  private sendAlert(metric: string, value: number, threshold: number, unit: string): void {
    console.error(`🚨 SECURITY ALERT: ${metric} exceeded threshold`, {
      current: `${value}${unit}`,
      threshold: `${threshold}${unit}`,
      timestamp: new Date().toISOString()
    });
    // In production, send to Slack/PagerDuty/Sentry
  }

  getReport(): Record<string, any> {
    return {
      timestamp: new Date().toISOString(),
      metrics: Array.from(this.metrics.values()),
      alerts: Array.from(this.metrics.values()).filter(m => m.alert)
    };
  }
}

/**
 * Metrics to track post-deployment
 */

// 1. JWT & Auth Metrics
// - auth_role_mismatch_attempts: Should be 0 (indicates exploitation attempts)
//   Alert: > 5 attempts in 1 hour
// - auth_token_age_rejections: Should be < 0.1% (indicates clock skew)
//   Alert: > 10 rejections in 1 hour
// - invalid_token_attempts: Should be < 1% of requests
//   Alert: > 100 in 1 hour

// 2. Cache Metrics
// - cache_memory_usage_mb: Should stay < 500MB
//   Alert: > 750MB (unbounded growth)
// - cache_size_violations: Should be 0 (cache exceeding maxSize)
//   Alert: > 1 violation in 1 hour
// - cache_hit_rate: Should be > 40%
//   Alert: < 20% (ineffective caching)

// 3. RAG Cost Metrics
// - rag_queries_rejected_cost: Should be < 5% of all RAG queries
//   Alert: > 10% (queries too expensive)
// - rag_estimated_cost_per_query: Should average < $0.15
//   Alert: > $0.50 per query (cost control failure)
// - rag_context_truncation_rate: Should be < 10%
//   Alert: > 20% (token limits too tight)

// 4. Saga/Upload Metrics
// - saga_compensation_failures: Should be < 1%
//   Alert: > 5% (rollback mechanism failing)
// - document_upload_success_rate: Should be > 95%
//   Alert: < 90% (saga pattern broken)

// 5. Performance Metrics
// - document_list_response_time_ms: Should be < 200ms after O(1) fix
//   Alert: > 500ms (performance regression)
// - vector_search_latency_ms: Should be < 100ms
//   Alert: > 200ms (indexing issue)

// 6. Error Metrics
// - pii_in_error_responses: Should be 0 (detected via log scanning)
//   Alert: > 0 (PII leak detected)
// - production_stack_traces_leaked: Should be 0
//   Alert: > 0 (error sanitization failure)

export const SECURITY_THRESHOLDS = {
  // Auth
  AUTH_ROLE_MISMATCH_PER_HOUR: 5,
  AUTH_TOKEN_AGE_REJECTIONS_PER_HOUR: 10,
  INVALID_TOKEN_ATTEMPTS_PERCENT: 1,

  // Cache
  CACHE_MEMORY_MB: 750,
  CACHE_SIZE_VIOLATIONS_PER_HOUR: 1,
  CACHE_HIT_RATE_PERCENT_MIN: 20,

  // RAG
  RAG_QUERIES_REJECTED_PERCENT: 10,
  RAG_AVG_COST_PER_QUERY: 0.50,
  RAG_CONTEXT_TRUNCATION_PERCENT: 20,

  // Saga
  SAGA_COMPENSATION_FAILURE_PERCENT: 5,
  DOCUMENT_UPLOAD_SUCCESS_PERCENT: 90,

  // Performance
  DOCUMENT_LIST_RESPONSE_MS: 500,
  VECTOR_SEARCH_LATENCY_MS: 200,

  // Errors
  PII_IN_ERROR_RESPONSES: 0,
  PRODUCTION_STACK_TRACES: 0
};

/**
 * Dashboard queries for monitoring
 */
export const MONITORING_QUERIES = {
  // Check for JWT role mismatches
  jwt_role_mismatches: `
    SELECT COUNT(*) as attempts
    FROM logs
    WHERE message LIKE '%Role mismatch detected%'
    AND timestamp > NOW() - INTERVAL 1 HOUR
  `,

  // Check cache performance
  cache_stats: `
    SELECT 
      cache_size,
      memory_usage_mb,
      hit_rate,
      entries_evicted
    FROM cache_metrics
    WHERE timestamp > NOW() - INTERVAL 1 HOUR
    ORDER BY timestamp DESC LIMIT 1
  `,

  // Check RAG cost
  rag_costs: `
    SELECT 
      COUNT(*) as total_queries,
      SUM(CASE WHEN rejected_cost = 1 THEN 1 ELSE 0 END) as rejected,
      AVG(estimated_cost) as avg_cost,
      MAX(estimated_cost) as max_cost
    FROM rag_queries
    WHERE timestamp > NOW() - INTERVAL 1 HOUR
  `,

  // Check upload success
  saga_success: `
    SELECT 
      COUNT(*) as total_uploads,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
      SUM(CASE WHEN status = 'compensated' THEN 1 ELSE 0 END) as failed_then_rolled_back
    FROM document_uploads
    WHERE timestamp > NOW() - INTERVAL 1 HOUR
  `,

  // Check for PII in errors
  pii_leaks: `
    SELECT 
      COUNT(*) as leak_count,
      GROUP_CONCAT(DISTINCT error_type) as types
    FROM error_logs
    WHERE message REGEXP '(email|phone|ssn|password)'
    AND timestamp > NOW() - INTERVAL 1 HOUR
  `
};
