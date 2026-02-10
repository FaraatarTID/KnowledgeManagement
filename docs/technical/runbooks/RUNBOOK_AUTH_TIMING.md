# Auth Timing Anomalies Runbook

## Symptom: Auth taking 100-200ms instead of 500ms

**Root Cause:** Constant-time verification disabled via feature flag

**Resolution:**
1. Check feature flag status:
   ```bash
   curl http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth
   ```

2. If disabled (rolloutPercentage: 0), enable it:
   ```bash
   curl -X POST http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth \
     -H "Content-Type: application/json" \
     -d '{"enabled": true, "rolloutPercentage": 100}'
   ```

3. Verify next auth attempt takes ~500ms:
   ```bash
   time curl -X POST http://localhost:3001/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "test12345"}'
   ```

**Expected Output:**
```
real    0m0.500s
user    0m0.100s
sys     0m0.050s
```

---

## Symptom: Auth taking 1000ms+ (timeout)

**Root Cause:** Connection pool exhausted or database slow

**Resolution:**

### Step 1: Check connection pool status
```bash
curl http://localhost:3001/api/health/pool-stats
```

**Expected Response:**
```json
{
  "activeConnections": 5,
  "queuedRequests": 0,
  "maxConnections": 10,
  "availableConnections": 5
}
```

### Step 2: If queuedRequests > 5, scale up connections
```bash
# Set environment variable
export SUPABASE_POOL_SIZE=15

# Restart service
systemctl restart aikb-server
```

### Step 3: Monitor for resolution
```bash
# Watch pool depth
watch -n 1 'curl -s http://localhost:3001/api/health/pool-stats | jq'
```

### Step 4: If still exhausted, investigate slow endpoint
```bash
# Get trace ID from error response
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test12345"}' \
  2>&1 | grep -i 'x-trace-id'

# View trace details
curl http://localhost:3001/api/admin/traces/abc123def456
```

---

## Symptom: Auth succeeding but taking variable times (50-500ms)

**Root Cause:** Constant-time jitter not working correctly

**Resolution:**

### Step 1: Verify feature flag enabled
```bash
curl http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth
# Should show: "enabled": true, "rolloutPercentage": 100
```

### Step 2: Run multiple auth attempts and verify timing consistency
```bash
for i in {1..10}; do
  echo "Attempt $i:"
  time curl -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "test12345"}' \
    2>/dev/null | jq '.token' | head -c 20
  echo ""
done
```

**Expected:** All attempts should take 480-520ms (500ms ± 20ms)

### Step 3: If jitter missing, check logs
```bash
tail -100 /var/log/aikb/server.log | grep -i "constant\|jitter\|timing"
```

### Step 4: If issue persists, disable feature flag for testing
```bash
curl -X POST http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Then re-enable after verifying normal operation:
```bash
curl -X POST http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

## Monitoring & Alerting

### Grafana Queries

**Auth Response Time (p50, p99):**
```influxql
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "auth_duration")
  |> filter(fn: (r) => r.success == "true")
  |> window(every: 5m)
  |> quantile(q: 0.50)
```

**Alert Thresholds:**
- **WARNING:** p99 > 600ms or p1 < 400ms (indicates flag misconfiguration)
- **CRITICAL:** p99 > 1000ms (connection pool issue or database slow)

### Dashboards
- **"AIKB Auth Response Time"** - Shows response time distribution
- **"AIKB Connection Pool"** - Shows active/queued connections
- **"AIKB Auth Errors"** - Shows failed login attempts

---

## Rollback Procedure

If auth timing issues persist after troubleshooting:

```bash
# 1. Disable constant-time auth (revert to fast auth)
curl -X POST http://localhost:3001/api/admin/feature-flags/priority_1_3_constant_time_auth \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 2. Monitor error rates
curl http://localhost:3001/api/health

# 3. If errors resolve, contact dev team
# Otherwise, may indicate broader infrastructure issue
```

---

## Related Issues

- **Security Impact:** Constant-time auth prevents timing attacks on credential validation
- **Performance Impact:** Expected 500ms latency, distributed uniformly
- **Compatibility:** Works with all RBAC and audit features

## See Also
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
- RUNBOOK_TRACING.md - Request tracing guide
