# Deployment Issues Runbook

## Symptom: Feature flags not taking effect after deployment

**Root Cause:** Feature flags cached in memory (default TTL 5 minutes)

**Impact:** New feature flag settings not applied immediately

**Resolution:**

### Step 1: Verify feature flag was updated
```bash
curl http://localhost:3000/api/admin/feature-flags/priority_3_X
```

**Expected Response (if updated):**
```json
{
  "name": "priority_3_X",
  "enabled": true,
  "rolloutPercentage": 50,
  "lastUpdated": "2026-02-01T12:35:00Z"
}
```

### Step 2: Check cache status
```bash
# View cache age
curl http://localhost:3000/api/admin/feature-flags?include=cache-info

# Response shows:
{
  "flags": [...],
  "cacheAge": {
    "secondsSinceUpdate": 45,
    "ttl": 300
  }
}
```

### Step 3: Force cache refresh
```bash
# Option A: Clear specific flag cache
curl -X POST http://localhost:3000/api/admin/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"keys": ["feature_flags:priority_3_X"]}'

# Option B: Clear all feature flag cache
curl -X POST http://localhost:3000/api/admin/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"keys": ["feature_flags:*"]}'

# Option C: Wait 5 minutes for TTL to expire
echo "Waiting for cache to expire... (5 minutes)"
sleep 300
```

### Step 4: Verify flag took effect
```bash
# Make a request that uses the flag
curl http://localhost:3000/api/admin/feature-flags/priority_3_X/status?userId=test-user

# Should reflect new setting
```

### Step 5: If flag still not applying, restart service
```bash
# Force service restart (last resort)
systemctl restart aikb-server

# Verify service is running
curl http://localhost:3000/api/health

# Check flag again
curl http://localhost:3000/api/admin/feature-flags/priority_3_X
```

---

## Symptom: Auth latency increases after Priority 1.3 deployment

**Root Cause:** Constant-time verification enabled but jitter not working

**Impact:** All auth requests take ~500ms instead of 50-100ms

**Resolution:**

### Step 1: Verify constant-time auth feature flag
```bash
curl http://localhost:3000/api/admin/feature-flags/priority_1_3_constant_time_auth
```

**Expected Response:**
```json
{
  "name": "priority_1_3_constant_time_auth",
  "enabled": true,
  "rolloutPercentage": 100,
  "description": "Prevents timing attacks on auth"
}
```

### Step 2: Check if jitter is working
```bash
# Run multiple auth attempts
for i in {1..5}; do
  echo "Attempt $i:"
  time curl -X POST http://localhost:3000/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "test12345"}' \
    -s -o /dev/null
done

# All times should be 480-520ms (500ms ± 20ms)
```

### Step 3: If no jitter, check logs
```bash
# Look for constant-time verification logs
tail -100 /var/log/aikb/server.log | grep -i "constant\|jitter\|timing"

# Expected: Should see jitter/timing logs
# If empty: Jitter code may not be executing
```

### Step 4: Check if priority_1_3 implementation is active
```bash
# Verify the constant-time auth service is running
curl http://localhost:3000/api/admin/system/status | grep -A5 "auth"
```

### Step 5: If jitter missing, review implementation
```bash
# Check if auth.service.ts includes constant-time verification
grep -n "jitter\|constant.time\|500.*ms" server/src/services/auth.service.ts

# Should see implementation
```

### Step 6: Disable constant-time auth temporarily for testing
```bash
# Disable to verify normal auth speed
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_3_constant_time_auth \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Test auth speed (should be 50-100ms)
time curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test12345"}'

# Re-enable
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_3_constant_time_auth \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

**This is expected behavior** - 500ms latency with constant-time verification is a security feature, not a bug.

---

## Symptom: Connection pool exhaustion after deployment

**Root Cause:** New version using more connections or connection churn

**Impact:** Requests queue, timeouts, degraded performance

**Resolution:**

### Step 1: Check pool status
```bash
curl http://localhost:3000/api/health/pool-stats
```

**Expected Response:**
```json
{
  "activeConnections": 8,
  "availableConnections": 2,
  "queuedRequests": 0,
  "maxConnections": 10,
  "utilizationPercent": 80
}
```

### Step 2: If queuedRequests > 0, pool is exhausted
```bash
# Check current settings
echo "Current pool size: $SUPABASE_POOL_SIZE"

# Increase pool size (typical: 10-20)
export SUPABASE_POOL_SIZE=15

# Restart service
systemctl restart aikb-server

# Verify new size
curl http://localhost:3000/api/health/pool-stats
```

### Step 3: Monitor pool metrics in Grafana
```bash
# Check dashboard: "AIKB Connection Pool"
# Look for: Active connections, queued requests, pool utilization

# Expected after increase:
# - Active connections should decrease
# - Queued requests should go to 0
# - Utilization percent should be < 70%
```

### Step 4: Identify specific endpoint causing issue
```bash
# Get traces for requests using most connections
curl 'http://localhost:3000/api/admin/traces?minConnections=5&limit=20' \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq '.[] | {endpoint: .spanName, connectionsUsed, duration: .durationMs}'
```

### Step 5: If issue persists, investigate endpoint
```bash
# Example: If /documents endpoint uses too many connections
# Check for N+1 queries, missing indexes, or connection leaks

grep -n "pool\|connection" server/src/controllers/document.controller.ts | head -20
```

### Step 6: Check for connection leaks
```bash
# Monitor pool growth over time
for i in {1..10}; do
  echo "Sample $i:"
  curl -s http://localhost:3000/api/health/pool-stats | jq '.activeConnections'
  sleep 5
done

# Should remain stable (not grow unbounded)
```

---

## Symptom: Error rate spikes after deployment

**Root Cause:** Regression in one of Priority 1/2 fixes

**Impact:** Users experiencing failures, error logs full

**Resolution:**

### Step 1: Check error rates by endpoint
```bash
curl http://localhost:3000/api/admin/metrics/errors?window=1h \
  -H "Authorization: Bearer ${ADMIN_TOKEN}"
```

**Response showing errors by endpoint:**
```json
{
  "errors": [
    {
      "endpoint": "/api/documents/upload",
      "errorCount": 45,
      "errorRate": 0.12,
      "topErrors": [
        {
          "type": "SagaCompensationError",
          "count": 40,
          "message": "Failed to delete from Drive"
        }
      ]
    }
  ]
}
```

### Step 2: Identify which deployment introduced error
```bash
# Check feature flags to see what's enabled
curl http://localhost:3000/api/admin/feature-flags
```

**Look for recently enabled flags:**
- priority_2_1_saga_pattern (document uploads)
- priority_1_1_vector_validation (search)
- priority_2_2_rbac_api_filtering (results)

### Step 3: Disable suspect feature flags one by one
```bash
# Example: If saga errors increasing, disable saga pattern
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_1_saga_pattern \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 0}'

# Monitor error rates
sleep 60 && curl http://localhost:3000/api/admin/metrics/errors?window=5m
```

### Step 4: If error rate recovers, that's the cause
```bash
# Report the feature flag as having issues
# Contact dev team with error logs

# Re-enable once fixed
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_1_saga_pattern \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 100}'
```

### Step 5: Check specific error logs
```bash
# Get error details with request IDs
tail -500 /var/log/aikb/server.log | grep ERROR | head -20

# Example:
# [ERROR] 2026-02-01T12:45:30Z requestId=req-xyz-123 endpoint=/api/documents/upload
# error=SagaCompensationError message="Failed to delete file from Drive"
```

### Step 6: Rollback if needed
```bash
# If unable to identify/fix issue quickly, rollback deployment
git revert HEAD
npm run build
systemctl restart aikb-server

# Verify error rates return to normal
curl http://localhost:3000/api/health
```

---

## Symptom: Request tracing not working after deployment

**Root Cause:** Tracing middleware not initialized or disabled

**Impact:** Unable to debug requests, no trace IDs in responses

**Resolution:**

### Step 1: Verify tracing is enabled
```bash
# Check if service initialized tracing
curl http://localhost:3000/api/health | jq '.tracing'

# Expected:
# {
#   "enabled": true,
#   "middleware": "active",
#   "traceIdGeneration": "working"
# }
```

### Step 2: Check for trace ID in response
```bash
# Make request and look for trace ID
curl -i http://localhost:3000/api/documents \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  | grep -i "x-trace-id"

# Should see: X-Trace-ID: abc123def456...
```

### Step 3: If no trace ID, check middleware registration
```bash
# Check server startup logs
tail -50 /var/log/aikb/server.log | grep -i "tracing\|middleware"

# Should see initialization message:
# "✓ Request tracing initialized"
```

### Step 4: Verify otel-setup.ts is imported
```bash
# Check if tracing is imported in index.ts
grep -n "tracingMiddleware\|otel\|tracing" server/src/index.ts

# Should see import and middleware registration
```

### Step 5: Restart service if needed
```bash
systemctl restart aikb-server

# Wait for startup
sleep 5

# Verify tracing
curl -i http://localhost:3000/api/health | grep -i "x-trace-id"
```

---

## Pre-Deployment Checklist

Before deploying Priority 1/2/3 changes:

- [ ] All feature flags defined (Priority 1-3 flags)
- [ ] Feature flags default to enabled (100% rollout)
- [ ] Connection pool size appropriate for load
- [ ] Error handling in place for new services
- [ ] Cache invalidation configured for new endpoints
- [ ] Rate limiting configured (if new auth paths)
- [ ] Tracing initialized for request tracking
- [ ] Metrics collectors configured
- [ ] Database migrations run (if needed)
- [ ] Redis connections tested

---

## Deployment Procedures

### Standard Deployment
```bash
# 1. Build new version
npm run build

# 2. Run database migrations (if needed)
npm run migrate

# 3. Start service (with health check)
systemctl restart aikb-server
sleep 10
curl http://localhost:3000/api/health

# 4. Monitor for 5 minutes
watch -n 1 'curl -s http://localhost:3000/api/health | jq .status'

# 5. If all healthy, enable feature flags gradually
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_X_Y \
  -d '{"rolloutPercentage": 10}'

# 6. Monitor error rates
watch -n 5 'curl -s http://localhost:3000/api/admin/metrics/errors | jq'

# 7. Gradually increase rollout: 10% -> 50% -> 100%
```

### Emergency Rollback
```bash
# 1. Disable all new feature flags
for flag in priority_1_3 priority_2_1 priority_2_2 priority_2_3 priority_2_4; do
  curl -X POST http://localhost:3000/api/admin/feature-flags/${flag} \
    -d '{"rolloutPercentage": 0}'
done

# 2. Revert code
git revert HEAD

# 3. Rebuild and restart
npm run build
systemctl restart aikb-server

# 4. Verify health
curl http://localhost:3000/api/health

# 5. Notify team
# "Deployment rolled back due to [specific issue]. Investigation underway."
```

---

## Monitoring Dashboard

After deployment, monitor these metrics:

- **Error Rate** (target < 1%)
- **Request Latency** (target p99 < 1000ms)
- **Auth Response Time** (target ~500ms with constant-time)
- **Cache Hit Rate** (target > 60%)
- **Connection Pool Usage** (target < 70%)
- **Vector Search Success** (target > 95%)
- **Saga Compensation** (target < 1% of uploads)

---

## See Also
- DEPLOYMENT_CHECKLIST_P1_P2.md - Detailed deployment checklist
- RUNBOOK_AUTH_TIMING.md - Auth latency troubleshooting
- RUNBOOK_SAGA_FAILURES.md - Saga issues
- RUNBOOK_CACHE_STALE.md - Cache issues
