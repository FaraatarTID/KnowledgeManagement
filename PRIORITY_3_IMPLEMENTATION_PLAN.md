# PRIORITY 3 IMPLEMENTATION PLAN: Polish & Observability

**Scope:** 5 polish features adding observability, testability, and operational excellence  
**Estimated Duration:** 20 hours  
**Status:** In-progress  

---

## 3.1: Feature Flags System (4 hours)

**Purpose:** Enable/disable fixes per user, environment, or percentage-based rollout

**Use Cases:**
- Disable saga pattern for specific users (testing)
- Enable constant-time auth only for critical users
- Gradual rollout (10% → 50% → 100%)
- Emergency disable without redeployment

**Implementation:**

**File:** `server/src/utils/feature-flags.ts` (NEW, 150+ lines)

**Features:**
```typescript
interface FeatureFlag {
  name: string;
  enabled: boolean;
  rolloutPercentage?: number; // 0-100 (default 100 if enabled=true)
  targetUsers?: string[]; // Specific user IDs
  targetEnvironments?: ('dev'|'staging'|'production')[];
  metadata?: Record<string, any>;
}

class FeatureFlagManager {
  // Evaluate: should user have access to feature?
  isEnabled(feature: string, userId?: string, env?: string): boolean
  
  // Bulk check multiple flags
  evaluateFlags(userId: string, env?: string): Record<string, boolean>
  
  // Runtime updates (no deploy needed)
  updateFlag(name: string, config: Partial<FeatureFlag>): void
  
  // Get current state
  getFlag(name: string): FeatureFlag | null
  getAll(): FeatureFlag[]
}

// Usage in code:
if (featureFlags.isEnabled('priority_1_3_constant_time_auth', userId)) {
  // Use constant-time auth (500ms floor)
} else {
  // Use fast auth (100ms, for testing)
}

if (featureFlags.isEnabled('priority_2_1_saga_pattern', userId, 'staging')) {
  // Use saga transactions with rollback
} else {
  // Use simple try/finally (old behavior)
}
```

**Integration Points:**
- `auth.service.ts`: Wrap constant-time verification in flag check
- `document.controller.ts`: Wrap saga pattern in flag check
- `vector.service.ts`: Wrap fail-loud validation in flag check
- `cache-invalidation.ts`: Wrap cache invalidation in flag check

**Data Storage:**
- Redis cache: `feature_flags:${flagName}` (TTL 5 min)
- Database fallback: `system_config.json` (persisted)
- JSON format:
```json
{
  "features": {
    "priority_1_3_constant_time_auth": {
      "enabled": true,
      "rolloutPercentage": 50,
      "targetEnvironments": ["staging", "production"]
    },
    "priority_2_1_saga_pattern": {
      "enabled": true,
      "rolloutPercentage": 100
    }
  }
}
```

**API Endpoints:**
```typescript
// Admin: Get all flags
GET /api/admin/feature-flags
Response: { features: Record<string, FeatureFlag> }

// Admin: Update flag
POST /api/admin/feature-flags/{name}
Body: { enabled: boolean, rolloutPercentage?: number, targetUsers?: string[] }
Response: { success: true, flag: FeatureFlag }

// Check flag status (for debugging)
GET /api/admin/feature-flags/{name}/status?userId=user123&env=staging
Response: { enabled: true, reason: "user matches rollout percentage" }
```

**Rollout Strategy:**
```json
{
  "priority_1_3_constant_time_auth": {
    "enabled": true,
    "rolloutPercentage": 0,  // Day 1: Disable (testing only)
    "targetUsers": ["admin1", "admin2"]
  }
}

// Day 2: 10% canary
{ "rolloutPercentage": 10 }

// Day 3: 50% if healthy
{ "rolloutPercentage": 50 }

// Day 4: 100% full rollout
{ "rolloutPercentage": 100 }
```

---

## 3.2: Distributed Request Tracing (5 hours)

**Purpose:** Trace requests across services (backend, vector search, database)

**Tool:** OpenTelemetry (industry standard)

**Benefits:**
- Visualize request flow through all services
- Identify bottlenecks (which service is slow?)
- Correlation ID linking (connect related logs/errors)

**File:** `server/src/utils/otel-setup.ts` (NEW, 200+ lines)

**Implementation:**

```typescript
import { BasicTracerProvider, ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/auto-instrumentations-node';

// Initialize tracer
const sdk = new NodeSDK({
  traceExporters: [
    // Console (dev): logs spans in real-time
    process.env.NODE_ENV === 'development' ? new ConsoleSpanExporter() : null,
    
    // Jaeger (production): sends to Jaeger collector
    process.env.NODE_ENV === 'production' ? new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces'
    }) : null
  ].filter(Boolean),
  instrumentations: [
    // Auto-instrument popular packages
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new PgInstrumentation(),  // PostgreSQL via Supabase
    new GrpcInstrumentation()  // Google Cloud APIs
  ]
});

sdk.start();

// Middleware for request tracing
export function tracingMiddleware(req: Request, res: Response, next: NextFunction) {
  const tracer = trace.getTracer('aikb-server');
  
  const span = tracer.startSpan(`${req.method} ${req.path}`, {
    attributes: {
      'http.method': req.method,
      'http.url': req.url,
      'http.target': req.path,
      'http.client_ip': req.ip,
      'http.user_id': (req as any).user?.id || 'anonymous'
    }
  });
  
  // Inject trace ID into response
  const traceId = span.spanContext().traceId;
  res.setHeader('X-Trace-ID', traceId);
  
  // Continue with tracing context
  context.with(trace.setSpan(context.active(), span), () => {
    next();
  });
  
  // End span
  span.end();
}

// Auto-span for async operations
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, any>
): Promise<T> {
  const tracer = trace.getTracer('aikb-server');
  const span = tracer.startSpan(name, { attributes });
  
  try {
    return await context.with(trace.setSpan(context.active(), span), () => fn());
  } finally {
    span.end();
  }
}
```

**Integration:**
```typescript
// In auth.service.ts
const result = await withSpan('auth.validateCredentials', async () => {
  // Hash verification traced automatically
  return await validateCredentialsImpl();
});

// In vector.service.ts
const results = await withSpan('vector.similaritySearch', async () => {
  // Vertex AI API calls traced automatically
  return await queryVertexAI(embedding, filters);
}, { topK, department: filters.department });
```

**Output Examples:**

**Development (Console):**
```
POST /api/chat - 234ms
├── auth.validateCredentials - 523ms (constant-time floor)
├── chat.generateResponse - 1240ms
│   ├── vector.similaritySearch - 189ms
│   │   └── vertex_ai.findNeighbors - 172ms
│   └── llm.complete - 1034ms
│       └── google_cloud.generateContent - 1031ms
└── middleware.errorHandler - 2ms
```

**Production (Jaeger UI):**
- Visual timeline of all spans
- Dependencies between services
- Latency breakdown per service
- Error traces with stack

**API Endpoint:**
```typescript
// Get trace by ID
GET /api/admin/traces/{traceId}
Response: {
  traceId: "abc123...",
  spans: [
    { spanId, name, duration, status, attributes }
  ]
}
```

---

## 3.3: Metrics Persistence to InfluxDB (5 hours)

**Purpose:** Store metrics over time, enable dashboards and alerting

**Metrics Tracked:**
- Auth response time (should be ~500ms)
- Cache hit rate (should improve to >60%)
- Error rates per endpoint
- Saga compensation triggers (should be <1%)
- Connection pool utilization
- Rate limiter lockouts (per hour)

**File:** `server/src/utils/metrics.ts` (NEW, 200+ lines)

**Implementation:**

```typescript
import { InfluxDB, Point } from '@influxdata/influxdb-client';

const influxDB = new InfluxDB({
  url: process.env.INFLUXDB_URL || 'http://localhost:8086',
  token: process.env.INFLUXDB_TOKEN,
  org: process.env.INFLUXDB_ORG,
  bucket: process.env.INFLUXDB_BUCKET
});

const writeApi = influxDB.getWriteApi(org, bucket);

export class Metrics {
  // Record auth timing
  recordAuthTime(userId: string, durationMs: number, success: boolean) {
    writeApi.writePoint(new Point('auth_duration')
      .tag('userId', userId)
      .tag('success', success.toString())
      .floatField('duration_ms', durationMs)
      .timestamp(Date.now() * 1000000)
    );
  }

  // Record cache operations
  recordCacheOperation(operation: 'hit'|'miss'|'invalidation', durationMs: number) {
    writeApi.writePoint(new Point('cache_operation')
      .tag('operation', operation)
      .floatField('duration_ms', durationMs)
      .timestamp(Date.now() * 1000000)
    );
  }

  // Record saga transactions
  recordSagaTransaction(
    transactionId: string,
    durationMs: number,
    status: 'success'|'compensation'|'failed'
  ) {
    writeApi.writePoint(new Point('saga_transaction')
      .tag('transactionId', transactionId)
      .tag('status', status)
      .floatField('duration_ms', durationMs)
      .timestamp(Date.now() * 1000000)
    );
  }

  // Record error
  recordError(endpoint: string, errorType: string, durationMs: number) {
    writeApi.writePoint(new Point('api_error')
      .tag('endpoint', endpoint)
      .tag('errorType', errorType)
      .floatField('duration_ms', durationMs)
      .timestamp(Date.now() * 1000000)
    );
  }

  // Flush to InfluxDB
  async flush() {
    await writeApi.flush();
  }
}

export const metrics = new Metrics();
```

**Integration:**
```typescript
// In auth.service.ts
const start = Date.now();
const result = await validateCredentials(email, password);
metrics.recordAuthTime(result?.id || 'unknown', Date.now() - start, !!result);

// In cache-invalidation.ts
const start = Date.now();
cache.set(key, value);
metrics.recordCacheOperation('miss', Date.now() - start);

// In saga-transaction.ts
await executeSaga('doc_upload', async (saga) => {
  const start = Date.now();
  // ... upload logic
  metrics.recordSagaTransaction(saga.id, Date.now() - start, 'success');
});

// In error.middleware.ts
metrics.recordError(req.path, error.type, duration);
```

**InfluxDB Queries (Grafana):**

```influxql
// Auth response time p99
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "auth_duration")
  |> window(every: 1m)
  |> quantile(q: 0.99)

// Cache hit rate
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "cache_operation")
  |> map(fn: (r) => ({r with hit: r.operation == "hit"}))
  |> stats()

// Error rate per endpoint
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "api_error")
  |> group(by: ["endpoint"])
  |> count()
```

**Grafana Dashboard:**
- Line graph: Auth response time over time (target 500ms)
- Gauge: Cache hit rate (target >60%)
- Heatmap: Error rate per endpoint
- Counter: Saga compensations triggered (target <1%)

---

## 3.4: OpenAPI Spec Generation (3 hours)

**Purpose:** Auto-generate REST API documentation

**Tool:** Swagger/OpenAPI 3.0

**File:** `server/src/utils/openapi-generator.ts` (NEW, 150+ lines)

**Implementation:**

```typescript
import { generateOpenAPI } from '@ts-rest/open-api';

// Define API contract
export const apiContract = c.router({
  auth: {
    login: {
      method: 'post' as const,
      path: '/auth/login',
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8)
      }),
      responses: {
        200: z.object({
          token: z.string(),
          userId: z.string()
        }),
        401: z.object({
          error: z.string()
        })
      }
    },
    logout: {
      method: 'post' as const,
      path: '/auth/logout',
      responses: { 200: z.object({ success: z.boolean() }) }
    }
  },
  
  documents: {
    list: {
      method: 'get' as const,
      path: '/documents',
      query: z.object({
        search: z.string().optional(),
        limit: z.number().default(20)
      }),
      responses: {
        200: z.object({
          documents: z.array(DocumentSchema),
          total: z.number()
        })
      }
    },
    upload: {
      method: 'post' as const,
      path: '/documents/upload',
      body: z.object({
        file: z.instanceof(File),
        title: z.string()
      }),
      responses: {
        201: DocumentSchema,
        400: ErrorSchema
      }
    },
    delete: {
      method: 'delete' as const,
      path: '/documents/:id',
      responses: { 200: z.object({ success: z.boolean() }) }
    }
  },
  
  chat: {
    query: {
      method: 'post' as const,
      path: '/chat/query',
      body: z.object({
        message: z.string(),
        context: z.object({
          department: z.string(),
          role: z.string()
        })
      }),
      responses: {
        200: z.object({
          response: z.string(),
          requestId: z.string(),
          integrity: IntegritySchema
        })
      }
    }
  }
});

// Generate OpenAPI spec
const openApiSpec = generateOpenAPI(apiContract, {
  title: 'AIKB API',
  description: 'Knowledge Management System API',
  version: '1.0.0',
  servers: [
    { url: 'http://localhost:3000', description: 'Development' },
    { url: 'https://api.aikb.example.com', description: 'Production' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
});

export function setupOpenAPI(app: Express) {
  // Swagger UI at /api/docs
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
  
  // Raw spec at /api/openapi.json
  app.get('/api/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });
}
```

**Output:**
- Swagger UI at `/api/docs` (interactive API explorer)
- OpenAPI JSON at `/api/openapi.json` (importable into other tools)
- Request/response examples
- Authentication scheme documentation
- Parameter validation rules

**Benefits:**
- Single source of truth (contract-driven development)
- Auto-generated client SDKs (TypeScript, JavaScript, Python, etc.)
- Interactive testing in Swagger UI
- Clear API documentation for team

---

## 3.5: Comprehensive Ops Runbooks (3 hours)

**Purpose:** Step-by-step procedures for common operational tasks

**Files Created:**

### `server/docs/RUNBOOK_AUTH_TIMING.md`
```markdown
## Auth Timing Anomalies

### Symptom: Auth taking 100-200ms instead of 500ms

**Root Cause:** Constant-time verification disabled via feature flag

**Resolution:**
1. Check feature flag: `curl http://localhost:3000/api/admin/feature-flags/priority_1_3_constant_time_auth`
2. If disabled, enable: `curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_3_constant_time_auth -d '{"enabled": true}'`
3. Verify: Next auth attempt should take 500ms

### Symptom: Auth taking 1000ms+ (timeout)

**Root Cause:** Connection pool exhausted

**Resolution:**
1. Check pool stats: `curl http://localhost:3000/api/health/pool-stats`
2. If queuedRequests > 5, scale up connections: `SUPABASE_POOL_SIZE=15`
3. Or reduce concurrent users temporarily

### Monitoring:
- Grafana: "Auth Response Time" graph (target 500ms ±50ms)
- Alert if: p99 > 600ms or p1 < 400ms (indicates flag misconfiguration)
```

### `server/docs/RUNBOOK_SAGA_FAILURES.md`
```markdown
## Saga Compensation Failures

### Symptom: Document in Vertex AI but not in Drive

**Root Cause:** Saga compensation failed to delete file

**Resolution:**
1. Find orphaned file: `SELECT * FROM documents WHERE drive_file_id IS NULL`
2. Manually delete from Drive: `curl -X DELETE https://www.googleapis.com/drive/v3/files/{fileId}`
3. Update metadata: `UPDATE documents SET drive_file_id=null WHERE id={docId}`

### Symptoms: Upload fails but file remains in Drive

**Root Cause:** Saga compensation never ran (process crashed mid-rollback)

**Resolution:**
1. Check transaction logs: `SELECT * FROM saga_transactions WHERE status='compensation_failed'`
2. Manually run compensation: `DELETE FROM drive WHERE id={fileId}`
3. Clear document metadata: `DELETE FROM documents WHERE id={docId} AND embedding_id IS NULL`

### Monitoring:
- Metric: saga_compensation_triggers (alert if > 1% of uploads)
- Log: Watch for "SagaTransaction.rollback" messages
- Dashboard: Saga compensation rate per hour
```

### `server/docs/RUNBOOK_CACHE_STALE.md`
```markdown
## Stale Cache Issues

### Symptom: Users seeing old document content after update

**Root Cause:** Cache invalidation event didn't fire

**Resolution:**
1. Check event listeners: `GET /api/admin/cache-listeners`
2. If no listeners, restart cache service
3. Manually clear cache: `redis-cli FLUSHDB` (dev) or restart service

### Symptom: Cache hit rate 0% (cache always misses)

**Root Cause:** Cache TTL too short or cache invalidation too aggressive

**Resolution:**
1. Check TTL: `GET /api/admin/cache-config`
2. If < 60 seconds, increase to 300 seconds
3. Check invalidation frequency: if > 10% of requests, disable for non-critical queries

### Monitoring:
- Metric: cache_hit_rate (target > 60%)
- Metric: cache_invalidation_events per hour (alert if spikes)
- Dashboard: Cache age distribution
```

### `server/docs/RUNBOOK_RATE_LIMIT.md`
```markdown
## Rate Limiting False Positives

### Symptom: User locked out despite correct password

**Root Cause:** Email-based rate limiter mistakenly triggered

**Resolution:**
1. Check lockout status: `GET /api/admin/ratelimit/user?email=user@example.com`
2. If locked, check lockout reason: `{ isLocked: true, lockedUntil: "2026-02-01T12:00:00Z", reason: "5 failed attempts" }`
3. Unlock immediately: `POST /api/admin/ratelimit/unlock?email=user@example.com`
4. Ask user to retry login

### Symptom: All users from department locked out

**Root Cause:** Distributed brute force attack detected (legitimate)

**Resolution:**
1. Check attack stats: `GET /api/admin/ratelimit/threats`
2. If targeting specific email, notify user of potential breach
3. Increase lock timeout temporarily: `POST /api/admin/ratelimit/config -d '{"lockDurationMinutes": 30}'`
4. Disable email-based limiting if false positives: `POST /api/admin/feature-flags/rate-limiter -d '{"rolloutPercentage": 0}'`

### Monitoring:
- Metric: lockout_events per hour (alert if > 10)
- Metric: lockout_per_user distribution (alert if > 5 users locked)
- Dashboard: Attack patterns (IPs, departments, times)
```

### `server/docs/RUNBOOK_VECTOR_ERRORS.md`
```markdown
## Vector Search Failures

### Symptom: "FATAL: Vertex AI Service unavailable" error

**Root Cause:** GOOGLE_CLOUD_PROJECT_ID not set or Vertex AI API quota exceeded

**Resolution:**
1. Check config: `curl http://localhost:3000/api/admin/config | grep GOOGLE_CLOUD_PROJECT_ID`
2. If missing, set: `export GOOGLE_CLOUD_PROJECT_ID=projects/my-project`
3. Check quota: `https://console.cloud.google.com/apis/quotas`
4. If quota exceeded, request increase

### Symptom: Searches returning 0 results for all queries

**Root Cause:** RBAC filters too restrictive (all results filtered out)

**Resolution:**
1. Check department filter: `GET /api/admin/rbac/config`
2. Verify user has permission: `GET /api/admin/rbac/user?userId={userId}`
3. If missing, add permission: `POST /api/admin/rbac/permissions -d '{"userId": "{userId}", "department": "Engineering"}'`
4. Retry search

### Monitoring:
- Metric: vector_search_success_rate (alert if < 95%)
- Metric: rbac_filter_rejections per hour (alert if spikes)
- Log: Watch for "FATAL:" errors (indicates fail-loud is working)
```

### `server/docs/RUNBOOK_DEPLOYMENT.md`
```markdown
## Deployment Issues

### Symptom: Feature flags not taking effect after deployment

**Root Cause:** Feature flags cached in memory (cache TTL 5min)

**Resolution:**
1. Clear flag cache: `redis-cli DEL feature_flags:*`
2. Or wait 5 minutes for cache to refresh
3. Verify flag updated: `GET /api/admin/feature-flags/priority_3_X`

### Symptom: Auth latency increases after Priority 1.3 deployment

**Root Cause:** Constant-time verification enabled but jitter not working

**Resolution:**
1. Check if feature flag enabled: `GET /api/admin/feature-flags/priority_1_3_constant_time_auth`
2. If enabled, check jitter: should see random delays in logs
3. If no jitter, disable feature flag and investigate: `POST /api/admin/feature-flags/priority_1_3_constant_time_auth -d '{"enabled": false}'`

### Symptom: Connection pool exhaustion after deployment

**Root Cause:** New version has higher connection churn

**Resolution:**
1. Check pool depth: `GET /api/health/pool-stats`
2. If queue > 5, scale up: `SUPABASE_POOL_SIZE=15`
3. Monitor pool metrics in Grafana
4. If still exhausted, investigate specific endpoint causing issue

### Monitoring:
- Deployment checklist: DEPLOYMENT_CHECKLIST_P1_P2.md
- Canary metrics: Error rate, latency, specific to new features
- Rollback procedure: If error rate > 5% for 10 minutes, automatic rollback
```

### `server/docs/RUNBOOK_TRACING.md`
```markdown
## Request Tracing Guide

### Finding a Slow Request

1. Get trace ID from response header: `X-Trace-ID: abc123...`
2. View trace in Jaeger UI: `http://localhost:16686/search?traceID=abc123`
3. Identify slow span (find orange/red spans indicating >100ms duration)
4. Check span attributes (dependencies, database queries, API calls)

### Correlating Errors to Traces

1. Find error in logs: Search for requestId in `error.middleware.ts` logs
2. `requestId: "req-abc123-2026-01-31T12:34:56Z"`
3. Get trace: Use trace ID in same format
4. See complete request flow (where did it fail?)

### Common Slow Span Patterns

- `vector.similaritySearch > 500ms`: Vertex AI slow, check API quota
- `auth.validateCredentials > 600ms`: Constant-time taking too long, check jitter
- `middleware.errorHandler > 100ms`: Error path slow, might need optimization
- `llm.complete > 2000ms`: LLM latency, expected to be slow

### Monitoring:
- Dashboard: Trace latency distribution (p50, p99)
- Alert if: p99 latency > 1000ms (indicates bottleneck)
- Set up SLO: 95% of requests < 500ms
```

---

## Implementation Order

1. **Day 1:** Feature flags system (4 hours) - enables gradual rollouts
2. **Day 2:** Metrics persistence (5 hours) - enables monitoring
3. **Day 3:** Distributed tracing (5 hours) - enables debugging
4. **Day 3:** OpenAPI spec (3 hours) - enables client generation
5. **Day 4:** Runbooks (3 hours) - enables ops self-service

**Total: ~20 hours**

---

## Success Criteria

✅ Feature flags enable/disable all Priority 1&2 fixes  
✅ Metrics show auth timing ~500ms, cache hit rate >60%, error rate <1%  
✅ Traces show complete request flow through all services  
✅ OpenAPI spec generates valid client SDKs  
✅ Runbooks enable ops to resolve 95% of issues without escalation  

