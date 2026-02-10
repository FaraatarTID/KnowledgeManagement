# Cache Stale Data Runbook

## Symptom: Users seeing old document content after update

**Root Cause:** Cache invalidation event didn't fire or cache TTL too long

**Impact:** Users see stale data, confusion about document contents

**Resolution:**

### Step 1: Verify cache invalidation listeners are active
```bash
curl http://localhost:3001/api/admin/cache-listeners
```

**Expected Response:**
```json
{
  "listeners": [
    {
      "event": "document.updated",
      "handlers": 1,
      "lastTriggered": "2026-02-01T12:34:56Z"
    },
    {
      "event": "document.deleted",
      "handlers": 1,
      "lastTriggered": "2026-02-01T12:34:10Z"
    }
  ]
}
```

### Step 2: If no listeners, check Redis connection
```bash
# Verify Redis is running
redis-cli ping
# Expected: PONG

# Check pub/sub subscriptions
redis-cli PUBSUB CHANNELS
# Expected: aikb:cache:invalidate (and other channels)
```

### Step 3: If Redis not responding, restart cache service
```bash
# Option A: Restart Redis directly
systemctl restart redis-server

# Option B: Restart AIKB service (connects to Redis)
systemctl restart aikb-server

# Verify connection restored
curl http://localhost:3001/api/health/cache
```

### Step 4: Manually clear stale document from cache
```bash
# Get document ID
DOC_ID="doc-123"

# Clear specific cache entry
curl -X POST http://localhost:3001/api/admin/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"keys": ["document:'"${DOC_ID}"'"]}'

# Or flush entire cache (dev only!)
# redis-cli FLUSHDB
```

### Step 5: Verify user sees updated content
```bash
# Have user refresh and fetch document
curl http://localhost:3001/api/documents/${DOC_ID} \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

---

## Symptom: Cache hit rate 0% (all requests miss cache)

**Root Cause:** Cache TTL too short, cache disabled, or cache keys not matching

**Resolution:**

### Step 1: Check cache configuration
```bash
curl http://localhost:3001/api/admin/cache-config
```

**Expected Response:**
```json
{
  "ttl": 300,
  "maxSize": 1000,
  "enabled": true,
  "hitRate": 0.0,
  "missRate": 1.0
}
```

### Step 2: If TTL too short (< 60 seconds), increase it
```bash
# Increase TTL to 5 minutes (300 seconds)
curl -X POST http://localhost:3001/api/admin/cache-config \
  -H "Content-Type: application/json" \
  -d '{
    "ttl": 300,
    "maxSize": 1000
  }'
```

### Step 3: If cache disabled, enable it
```bash
curl -X POST http://localhost:3001/api/admin/cache-config \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### Step 4: Monitor hit rate improvement
```bash
# Check every 10 seconds for 2 minutes
for i in {1..12}; do
  echo "Sample $i:"
  curl -s http://localhost:3001/api/admin/cache-config | jq '.hitRate'
  sleep 10
done
```

**Expected:** Hit rate should increase to > 60% after 30 seconds

### Step 5: If still 0%, check cache keys
```bash
# Get sample cache keys
redis-cli KEYS "document:*" | head -20

# Check key count
redis-cli DBSIZE
```

If DBSIZE = 0, cache is empty. This is normal for new instances. Monitor over 5 minutes.

---

## Symptom: Cache invalidation spamming logs

**Root Cause:** Cache invalidation too aggressive (excessive updates)

**Impact:** High CPU, Redis connection pool exhaustion, slow requests

**Resolution:**

### Step 1: Check invalidation frequency
```bash
# Check logs
tail -1000 /var/log/aikb/server.log | grep -i "invalidat" | wc -l

# Expected: Should see < 10 invalidations per minute
```

### Step 2: If too frequent, check what's being updated
```bash
tail -1000 /var/log/aikb/server.log | grep "cache:invalidate" | cut -d' ' -f5- | sort | uniq -c | sort -rn
```

### Step 3: Identify offending document or endpoint
```bash
# Find document with excessive updates
grep "document:" /var/log/aikb/server.log | grep "invalidate" | head -20
```

### Step 4: Check if document in edit loop or polling
```bash
# Query database for excessive updates in last 10 minutes
SELECT id, title, updated_at, updated_by
FROM documents
WHERE updated_at > NOW() - INTERVAL '10 minutes'
ORDER BY updated_at DESC
LIMIT 20;
```

### Step 5: Disable invalidation for non-critical queries
```bash
# Temporarily disable aggressive cache invalidation
curl -X POST http://localhost:3001/api/admin/feature-flags/cache-aggressive-invalidation \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Monitor impact
sleep 30 && curl http://localhost:3001/api/health
```

---

## Monitoring & Prevention

### Key Metrics
```influxql
# Cache hit rate (target > 60%)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "cache_operation")
  |> filter(fn: (r) => r.operation == "hit")
  |> window(every: 5m)
  |> count()

# Cache invalidation events (target < 1 per second)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "cache_invalidate")
  |> window(every: 1m)
  |> count()
```

### Alerting Rules

**WARNING:** Cache hit rate < 50% for > 5 minutes
```bash
curl http://localhost:3001/api/admin/metrics/cache
```

**CRITICAL:** Cache hit rate < 20% for > 5 minutes
```bash
# May indicate cache disabled or Redis down
curl http://localhost:3001/api/health/cache
```

### Dashboard
- **"AIKB Cache Performance"** - Hit rate, miss rate, invalidation frequency
- **"AIKB Cache Size"** - Memory usage, key count
- **"AIKB Redis Connection Pool"** - Active connections, queue depth

---

## Cache Invalidation Configuration

### Document Update Events
- `document.title_changed` → Invalidate document cache
- `document.content_changed` → Invalidate document + vector cache
- `document.permissions_changed` → Invalidate RBAC filter cache
- `document.moved` → Invalidate list caches

### Default TTL by Type
| Type | TTL | Rationale |
|------|-----|-----------|
| document | 5 min | Content relatively stable |
| vector search | 10 min | Search expensive, low change frequency |
| RBAC filter | 1 hour | Permissions rarely change |
| auth token | 24 hours | Security + performance tradeoff |
| system config | 5 min | May change via admin API |

---

## Rollback Procedure

If cache issues causing cascading failures:

```bash
# 1. Flush entire cache (will cause spike in query load!)
redis-cli FLUSHDB

# 2. Monitor query latency and error rates
watch -n 1 'curl -s http://localhost:3001/api/health | jq'

# 3. If system recovers, cache is issue
# 4. If system still degraded, cache not the root cause
```

---

## Prevention Checklist

- [ ] Monitor cache hit rate daily (target > 60%)
- [ ] Monitor cache invalidation frequency (target < 1/second)
- [ ] Review Redis memory usage weekly
- [ ] Test cache invalidation on content updates
- [ ] Verify cache disabled correctly on deployment
- [ ] Set up alerts for hit rate < 50%

---

## See Also
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
- RUNBOOK_TRACING.md - Request tracing guide
- Cache configuration: `server/src/utils/cache-invalidation.ts`
