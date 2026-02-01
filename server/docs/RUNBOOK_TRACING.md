# Request Tracing Guide

## Overview

Request tracing allows you to see the complete flow of a request through all services. Each request gets a unique trace ID that follows it through:

- HTTP request entry
- Auth middleware
- Business logic execution
- Database queries
- Vertex AI calls
- Response serialization

## Finding a Slow Request

### Step 1: Get trace ID from response
```bash
# Make a request and capture response headers
curl -i http://localhost:3000/api/documents \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# Look for:
# X-Trace-ID: abc123def456xyz789
```

### Step 2: View trace details
```bash
TRACE_ID="abc123def456xyz789"

curl http://localhost:3000/api/admin/traces/${TRACE_ID} \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Expected Response:**
```json
{
  "traceId": "abc123def456xyz789",
  "spanId": "root-span-001",
  "spanName": "GET /api/documents",
  "startTime": 1675184496000,
  "endTime": 1675184496350,
  "durationMs": 350,
  "status": "ok",
  "spans": [
    {
      "spanId": "span-001",
      "spanName": "auth.validateToken",
      "durationMs": 25,
      "status": "ok"
    },
    {
      "spanId": "span-002",
      "spanName": "database.query",
      "durationMs": 100,
      "status": "ok"
    },
    {
      "spanId": "span-003",
      "spanName": "rbac.filter",
      "durationMs": 50,
      "status": "ok"
    },
    {
      "spanId": "span-004",
      "spanName": "response.serialize",
      "durationMs": 30,
      "status": "ok"
    }
  ]
}
```

### Step 3: Identify slow span
- Look for spans with `durationMs > 100`
- Red/orange colored spans indicate >100ms
- Check child spans to find exact bottleneck

**In this example:**
- `auth.validateToken`: 25ms ✓ Normal
- `database.query`: 100ms ⚠️ At limit
- `rbac.filter`: 50ms ✓ Normal
- `response.serialize`: 30ms ✓ Normal
- **Total: 350ms** (acceptable)

### Step 4: Deep dive on slow operation
```bash
TRACE_ID="abc123def456xyz789"
SPAN_ID="span-002"

curl http://localhost:3000/api/admin/traces/${TRACE_ID}/spans/${SPAN_ID} \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Expected Response with attributes:**
```json
{
  "spanId": "span-002",
  "spanName": "database.query",
  "durationMs": 100,
  "attributes": {
    "query": "SELECT * FROM documents WHERE ...",
    "rowsReturned": 42,
    "databaseName": "aikb",
    "connectionPoolWait": 5,
    "queryExecutionTime": 95
  },
  "status": "ok"
}
```

---

## Correlating Errors to Traces

### Finding error logs
```bash
# Search error logs for request ID
grep "ERROR" /var/log/aikb/server.log | head -10

# Example output:
# [ERROR] 2026-02-01T12:34:56Z requestId=req-abc123-2026-02-01T12:34:56Z error=AuthenticationError

REQUEST_ID="req-abc123-2026-02-01T12:34:56Z"
```

### Get trace using request ID
```bash
REQUEST_ID="req-abc123-2026-02-01T12:34:56Z"

curl http://localhost:3000/api/admin/traces/by-request-id/${REQUEST_ID} \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

### See complete error flow
```bash
TRACE_ID="xyz789abc123def456"

# Get trace with full details
curl http://localhost:3000/api/admin/traces/${TRACE_ID}?include=full \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response includes error details:**
```json
{
  "traceId": "xyz789abc123def456",
  "status": "error",
  "error": {
    "type": "AuthenticationError",
    "message": "Invalid JWT token",
    "stack": "at validateToken (auth.service.ts:45)",
    "requestId": "req-abc123-2026-02-01T12:34:56Z",
    "statusCode": 401
  },
  "spans": [
    {
      "spanId": "span-001",
      "spanName": "auth.validateToken",
      "status": "error",
      "statusMessage": "Token verification failed",
      "exception": {
        "type": "JsonWebTokenError",
        "message": "invalid token"
      }
    }
  ]
}
```

---

## Common Slow Span Patterns

### 1. Vector similarity search > 500ms
```json
{
  "spanName": "vector.similaritySearch",
  "durationMs": 750,
  "attributes": {
    "embeddingDimension": 768,
    "topK": 10,
    "rbacFiltered": 45,
    "model": "textembedding-gecko@002"
  }
}
```

**Cause:** Vertex AI slow, quota at limit, or many results to filter

**Solution:**
1. Check Vertex AI quota: `curl http://localhost:3000/api/health/vector-db`
2. Reduce topK if searching many results
3. Add department filter to reduce search space

### 2. Auth validation > 600ms
```json
{
  "spanName": "auth.validateCredentials",
  "durationMs": 620,
  "attributes": {
    "constantTimeVerification": true,
    "jitter": 25,
    "hashComputationTime": 500,
    "comparisonTime": 95
  }
}
```

**Cause:** Constant-time verification with jitter (expected ~500ms)

**Normal pattern** - No action needed if feature flag enabled

### 3. Database query > 200ms
```json
{
  "spanName": "database.query",
  "durationMs": 250,
  "attributes": {
    "query": "SELECT * FROM documents WHERE department=? AND...",
    "rowsScanned": 50000,
    "rowsReturned": 5,
    "connectionPoolWait": 10
  }
}
```

**Cause:** Full table scan or missing index

**Solution:**
1. Check query plan: `EXPLAIN <query>`
2. Add index if scanning too many rows
3. Consider query rewrite

### 4. RBAC filtering > 100ms
```json
{
  "spanName": "rbac.filterSearchResults",
  "durationMs": 120,
  "attributes": {
    "inputResults": 100,
    "outputResults": 15,
    "filterType": "department",
    "policiesEvaluated": 8
  }
}
```

**Cause:** Complex RBAC policies or many documents to filter

**Solution:**
1. Review RBAC policy complexity
2. Consider database-level filtering instead
3. Cache RBAC results if applicable

### 5. Error handling > 50ms
```json
{
  "spanName": "errorHandler.processError",
  "durationMs": 75,
  "attributes": {
    "errorType": "DatabaseError",
    "retrying": true,
    "retryCount": 2,
    "serialization": 25
  }
}
```

**Cause:** Error logging, serialization, or retry logic

**Normal** - Error paths can be slower

---

## Performance Optimization Tips

### Identify optimization opportunities
```bash
# Get traces for slow endpoints
curl 'http://localhost:3000/api/admin/traces?endpoint=/api/documents&minDurationMs=1000' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq '.[] | {traceId, endpoint, durationMs, topSlowSpans: .spans | sort_by(.durationMs) | reverse | .[0:3]}'
```

### Monitor by span type
```bash
# Get slowest operations across all requests
curl 'http://localhost:3000/api/admin/spans/slowest?limit=20' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq '.[] | {spanName, avgDurationMs, p99DurationMs, occurrences}'
```

---

## Setting Performance SLOs

### Define target latencies
| Operation | Target P50 | Target P99 |
|-----------|-----------|-----------|
| auth.validateToken | 50ms | 100ms |
| database.query | 50ms | 200ms |
| vector.similaritySearch | 200ms | 500ms |
| rbac.filter | 30ms | 100ms |
| GET /documents | 100ms | 500ms |
| POST /chat/query | 500ms | 2000ms |

### Check SLO compliance
```bash
# Get metrics for specific operation
curl 'http://localhost:3000/api/admin/metrics/span/auth.validateToken?window=1h' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response:**
```json
{
  "spanName": "auth.validateToken",
  "window": "1h",
  "sampleCount": 1250,
  "metrics": {
    "p50": 45,
    "p99": 95,
    "p999": 120,
    "avgDurationMs": 52,
    "maxDurationMs": 150,
    "minDurationMs": 35
  },
  "sloCompliance": 0.99
}
```

---

## Debugging Distributed Issues

### Tracing through multiple services
```bash
# If you have multiple services, trace ID propagates through all
TRACE_ID="abc123def456xyz789"

# Check client service logs
grep ${TRACE_ID} /var/log/aikb/client.log

# Check server service logs
grep ${TRACE_ID} /var/log/aikb/server.log

# Check any middleware logs
grep ${TRACE_ID} /var/log/aikb/middleware.log

# All should reference same trace ID
```

### Understanding span hierarchy
```json
{
  "traceId": "xyz789abc123def456",
  "rootSpan": {
    "spanId": "root-001",
    "spanName": "POST /chat/query",
    "children": [
      {
        "spanId": "span-001",
        "spanName": "auth.validateToken",
        "durationMs": 50
      },
      {
        "spanId": "span-002",
        "spanName": "chat.processQuery",
        "durationMs": 800,
        "children": [
          {
            "spanId": "span-003",
            "spanName": "vector.similaritySearch",
            "durationMs": 300
          },
          {
            "spanId": "span-004",
            "spanName": "llm.complete",
            "durationMs": 450
          }
        ]
      }
    ]
  }
}
```

---

## Tracing Best Practices

### In your code
```typescript
// Manually add span for custom operation
import { withSpan } from '../utils/otel-setup';

async function customOperation() {
  const result = await withSpan('customOperation', async () => {
    // Do work here
    return await expensiveOperation();
  }, {
    userId: user.id,
    department: user.department,
    dataSize: items.length
  });
  
  return result;
}
```

### Capturing context
```typescript
// Include relevant context in span attributes
withSpan('database.query', async () => {
  const result = await query(sql);
  return result;
}, {
  query: sql,  // What query was run
  rowsReturned: result.length,  // How many results
  duration: Date.now() - start  // Execution time
});
```

### Avoiding PII in traces
```typescript
// DON'T include passwords, tokens, PII
withSpan('auth.validateCredentials', async () => {
  // ...validate...
}, {
  userId: user.id,  // OK - User ID
  method: 'email',  // OK - Auth method
  // email: user.email,  // DON'T - PII
  // password: password,  // DON'T - Secret
});
```

---

## Exporting & Analyzing Traces

### Export traces for analysis
```bash
# Export traces from last hour
curl 'http://localhost:3000/api/admin/traces/export?format=json&duration=1h' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -o traces.json

# Analyze with tools like jq
jq 'group_by(.spanName) | map({spanName: .[0].spanName, avgDuration: (map(.durationMs) | add / length)})' traces.json
```

### Send to external tracing (optional)
```bash
# If using full OpenTelemetry, export to Jaeger
# curl -X POST http://jaeger:14268/api/traces -d @trace.json
```

---

## Common Trace Patterns

### Fast request (< 100ms)
```
GET /api/documents
├─ auth.validateToken (20ms)
├─ database.query (50ms)
├─ rbac.filter (15ms)
└─ response.serialize (10ms)
Total: 95ms ✓
```

### Moderate request (100-500ms)
```
POST /api/chat/query
├─ auth.validateToken (20ms)
├─ chat.processQuery (450ms)
│  ├─ vector.similaritySearch (300ms)
│  └─ llm.complete (100ms)
└─ response.serialize (25ms)
Total: 495ms ✓
```

### Slow request (> 1000ms) - Investigation needed
```
POST /api/documents/upload
├─ auth.validateToken (50ms)
├─ document.parseFile (800ms) ⚠️ Slow
├─ vector.encode (600ms) ⚠️ Very slow
├─ database.insert (200ms) ⚠️ Slow
└─ response.serialize (30ms)
Total: 1680ms ✗
```

---

## Alerting on Traces

### Set up latency alerts
```bash
# Alert if request takes > 2 seconds
curl -X POST http://localhost:3000/api/admin/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "slow_requests",
    "condition": "max(request_duration_ms) > 2000",
    "window": "5m",
    "severity": "warning"
  }'

# Alert if specific endpoint slow
curl -X POST http://localhost:3000/api/admin/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "slow_vector_search",
    "condition": "max(span_duration_ms where span_name=vector.similaritySearch) > 1000",
    "window": "5m",
    "severity": "warning"
  }'
```

---

## See Also
- RUNBOOK_AUTH_TIMING.md - Auth performance troubleshooting
- RUNBOOK_VECTOR_ERRORS.md - Vector search troubleshooting
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
