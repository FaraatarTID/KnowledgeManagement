# DEPLOYMENT CHECKLIST: Priority 1 & 2 Fixes

**Status:** Ready for production deployment  
**Fixes Deployed:** 10 total (5 Priority 1, 5 Priority 2)  
**Compilation:** 0 TypeScript errors  
**Test Coverage:** 7 integration test suites  

---

## PRE-DEPLOYMENT: Staging Validation (Approx 4-6 hours)

### Infrastructure Checks
- [ ] **Supabase Connection Pool**
  - [ ] Deploy `supabase-pool.ts` to staging
  - [ ] Set `SUPABASE_POOL_SIZE=10` in staging env
  - [ ] Monitor connection queue depth for 30min (should stay < 2)
  - [ ] Verify no "QUEUE_TIMEOUT" errors in logs
  - [ ] Test pool stats: `GET /api/health/pool-stats`

- [ ] **Google Cloud Vertex AI**
  - [ ] Verify `GOOGLE_CLOUD_PROJECT_ID` is set in staging
  - [ ] Test vector service starts without fallback errors
  - [ ] Run test embedding: `node -e "const v = require('./dist/services/vector.service.js'); v.upsertToVertexAI(...)"`
  - [ ] Confirm no "FATAL: Vertex AI unavailable" in logs

- [ ] **Cache Infrastructure**
  - [ ] Verify Redis/local cache available (if used)
  - [ ] Test TTL-based expiration: entries expire after 5min
  - [ ] Monitor cache hit rate: should improve to > 60%

### Application Checks
- [ ] **Authentication Service**
  - [ ] Test constant-time verification: all failed auth attempts take ~500ms ±50ms
  - [ ] Test with 5+ failed attempts → account lockout triggered
  - [ ] Test with correct password → auth succeeds in ~500ms
  - [ ] Verify jitter added BEFORE hash verification (check logs)
  - [ ] Verify no timing attack signals in auth timing logs

- [ ] **Rate Limiter**
  - [ ] Test auth limiter uses email (not IP) for key
  - [ ] Test global limiter uses user ID for key
  - [ ] Test with distributed IPs → all limited correctly
  - [ ] Test localhost bypass works in dev mode
  - [ ] Verify rate limit headers present: `RateLimit-Limit`, `RateLimit-Remaining`

- [ ] **Document Upload**
  - [ ] Test saga transaction with Drive → metadata → embedding → history
  - [ ] Intentionally fail embedding step → Drive file should auto-delete (compensation)
  - [ ] Verify saga transaction ID in logs for tracing
  - [ ] Test concurrent uploads (5+) → all succeed or all fail (no partial states)

- [ ] **Vector Search**
  - [ ] Test RBAC filters applied at API level (not app level)
  - [ ] Query with missing filters → should fail with "missing security filters" error
  - [ ] Test department filter works: user can only see docs for their department
  - [ ] Test role filter works: IC can't see Manager-only docs
  - [ ] Test combined filters (dept + role) → intersection enforced

- [ ] **Error Handling**
  - [ ] Trigger an error via `/api/test-error` endpoint
  - [ ] Verify response includes: `requestId`, `supportId`, `message`
  - [ ] Verify logs include: `requestId`, `userId`, `timestamp`, `errorType`
  - [ ] Test requestId format: `req-[uuid]-[timestamp]`
  - [ ] Test supportId format: `SUP-req-[uuid]-[timestamp]`

- [ ] **Cache Invalidation**
  - [ ] Update a document → cache should invalidate within 1 second
  - [ ] Delete a document → document cache should be removed
  - [ ] Test TTL expiration: verify entries expire after 5min
  - [ ] Monitor cache event logs: verify `document_deleted`, `document_updated` events
  - [ ] Test concurrent updates (10+) → cache remains consistent

### Integration Tests
- [ ] **Run Full Integration Suite**
  ```bash
  # In staging environment
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm test -- --run integration
  ```
  - [ ] Auth timing tests pass (< 150ms variance)
  - [ ] Rate limiter tests pass (lockout at 5 attempts)
  - [ ] Saga transaction tests pass (compensation runs)
  - [ ] RBAC filtering tests pass (filters applied)
  - [ ] Error linking tests pass (requestId present)
  - [ ] Cache invalidation tests pass (events received)
  - [ ] Load tests pass (100 concurrent requests)

- [ ] **Unit Test Suite**
  ```bash
  npm test -- --run unit
  ```
  - [ ] All tests pass
  - [ ] Coverage > 80% for modified files

- [ ] **Regression Tests**
  - [ ] Existing chat functionality works
  - [ ] Existing document search works
  - [ ] User login/logout works
  - [ ] Admin panel works (if applicable)

### Performance Validation
- [ ] **Response Time SLA**
  - [ ] Auth endpoint: p99 < 600ms (accounting for 500ms minimum)
  - [ ] Vector search: p99 < 200ms (should be faster with API-level RBAC)
  - [ ] Document upload: p99 < 5s (including Drive upload + embedding)
  - [ ] Error handling: < 50ms overhead

- [ ] **Load Test (Staging)**
  ```bash
  # 100 concurrent users for 10 minutes
  # Monitor: response times, error rates, pool depth
  ```
  - [ ] Connection pool never exceeds max (10 connections)
  - [ ] Rate limiter effective (lockouts after 5 failed attempts)
  - [ ] No "QUEUE_TIMEOUT" errors
  - [ ] Error rate < 1% (excluding intentional failures)
  - [ ] p99 response time < 500ms

- [ ] **Memory/CPU**
  - [ ] Memory usage < 500MB (at 100 concurrent)
  - [ ] CPU usage < 70%
  - [ ] No memory leaks over 1 hour test
  - [ ] Event listeners don't accumulate

### Security Validation
- [ ] **Timing Attack Resistance**
  - [ ] Run 50 failed auth attempts, measure timings
  - [ ] Standard deviation < 50ms
  - [ ] No outliers > 150ms faster than mean
  - [ ] Jitter evident in logs (randomInt calls)

- [ ] **RBAC Enforcement**
  - [ ] Test with invalid department → search fails
  - [ ] Test with high-privilege role as low-privilege user → blocked
  - [ ] Test cross-department search → fails (even with valid role)
  - [ ] Audit log shows failed search attempts with reason

- [ ] **Rate Limit Bypass Prevention**
  - [ ] VPN + proxy cannot bypass email-based auth limiter
  - [ ] Multiple IPs → still limited per email
  - [ ] Distributed brute force (rotating IPs) → detected as single user
  - [ ] Auth lockout persists across sessions

### Data Integrity Checks
- [ ] **Saga Compensation Correctness**
  - [ ] Count orphaned documents in Drive (should be 0)
  - [ ] Count metadata without embeddings (should be 0)
  - [ ] Verify no partial states in database
  - [ ] Run: `SELECT * FROM documents WHERE embedding_id IS NULL;` → 0 rows

- [ ] **Cache Consistency**
  - [ ] Compare cached results vs fresh DB query → identical
  - [ ] Update document, wait 1s, query cache → updated version served
  - [ ] After 5min without access, query → cache miss, then cache hit on next query

---

## PRODUCTION DEPLOYMENT: Phased Rollout

### Phase 1: Canary (10% of users) - 1 hour
- [ ] Deploy to 1 server/container
- [ ] Route 10% of traffic to canary
- [ ] Monitor error rate: < 0.5% (excluding expected failures)
- [ ] Monitor latency: p99 < 500ms
- [ ] Monitor auth lockouts: < 1% legitimate users
- [ ] Monitor rate limiting: no false positives
- [ ] **Go/No-Go Decision:** If metrics OK → Phase 2

### Phase 2: Limited Rollout (50% of users) - 2 hours
- [ ] Deploy to 5 servers/containers
- [ ] Route 50% of traffic to new version
- [ ] Monitor same metrics (error rate, latency, lockouts)
- [ ] Test with real production load (2x+ higher than canary)
- [ ] Monitor cache invalidation events (should see spikes on doc updates)
- [ ] **Go/No-Go Decision:** If metrics OK → Phase 3

### Phase 3: Full Production (100% of users) - Immediate
- [ ] Deploy to all servers/containers
- [ ] Monitor for 24 hours
- [ ] Check error rates per endpoint
- [ ] Verify no duplicate requestIds in logs (cache invalidation unique)
- [ ] Check support tickets for new issues (should be 0)

---

## POST-DEPLOYMENT: 24-Hour Monitoring

### Metrics to Track
- [ ] **Error Rate by Type**
  ```
  - VertexAIError (should be ~0.1%)
  - RateLimitError (should be ~2-5%, mostly from bots)
  - AuthenticationError (should be ~1-2%)
  - Other errors (should be < 0.1%)
  ```

- [ ] **Auth Metrics**
  ```
  - Lockout count per hour (should be stable, not increasing)
  - Failed auth attempts per user (should be < 5 for legitimate users)
  - Auth timing variance (should be < 50ms)
  ```

- [ ] **Search Metrics**
  ```
  - Cache hit rate (should improve to > 60% from previous < 40%)
  - Search response time p99 (should improve or stay same)
  - RBAC filter rejections (monitor for false positives)
  ```

- [ ] **Upload Metrics**
  ```
  - Saga compensation triggers (should be < 1% of uploads)
  - Average upload time (should be similar to before)
  - Orphaned documents count (should stay 0)
  ```

### Alert Thresholds
Set up alerts for:
- [ ] Auth timing > 1000ms or < 300ms (anomaly)
- [ ] Auth lockout rate > 10% (DDoS or config issue)
- [ ] Error rate > 2% (system degradation)
- [ ] Cache invalidation event backlog > 1000 (processing lag)
- [ ] Connection pool queue depth > 5 (exhaustion risk)
- [ ] Memory usage > 70% (memory leak)

### Incident Response Plan
If issues occur:
- [ ] **High Error Rate (> 5%)**
  - [ ] Check Supabase connection pool depth
  - [ ] Check Vertex AI API quota
  - [ ] Check requestId logs for patterns
  - [ ] Consider rollback if > 10%

- [ ] **High Lockout Rate (> 5%)**
  - [ ] Check if rate limiter configuration correct (email keying)
  - [ ] Check for DDoS signals (high volume from few emails)
  - [ ] Consider increasing lockout duration if under attack

- [ ] **Cache Inconsistency**
  - [ ] Flush all caches (restart services)
  - [ ] Reset TTL to 2min (shorter) temporarily
  - [ ] Monitor for recurrence

---

## ROLLBACK PLAN (If needed)

**Pre-Rollback Decision Points:**
- Error rate > 5% for > 10 minutes
- Auth timing outside 400-600ms range
- RBAC filters blocking legitimate access
- Production data corruption detected

**Rollback Steps:**
1. Set canary traffic to 0%
2. Redeploy previous version (before Priority 1 & 2 fixes)
3. Clear all caches (flush Redis if used)
4. Monitor error rate drops to normal
5. Post-incident: debug and identify root cause

**Rollback Verification:**
- [ ] Error rate < 1% (or pre-fix baseline)
- [ ] Auth response time < 100ms (no constant-time overhead)
- [ ] User reports of lockouts decrease
- [ ] No new errors in logs

---

## SUCCESS CRITERIA

**Deployment is successful if after 24 hours:**
- ✅ Error rate < 1% (excluding expected failures)
- ✅ Auth timing 450-550ms (constant-time working)
- ✅ Auth lockouts < 1% of users (false positives)
- ✅ Cache hit rate > 60% (up from < 40%)
- ✅ No orphaned documents (saga working)
- ✅ RBAC filters enforced (no unauthorized access)
- ✅ All integration tests pass in production
- ✅ Zero support tickets about new issues
- ✅ Connection pool never exceeds 8 concurrent connections
- ✅ All requestIds appear in logs (tracing working)

---

## Sign-Off

**Prepared by:** Code Review Team  
**Date:** January 31, 2026  
**Reviewed by:** ___________  
**Approved by:** ___________  
**Deployment Date:** ___________  
**Rollback Decision by:** ___________  

