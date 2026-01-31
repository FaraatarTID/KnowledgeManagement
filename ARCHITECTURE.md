# 🏗️ System Architecture: Current vs. Target State

---

## **CURRENT STATE (Pre-Fixes)**

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                       │
│  - Zustand store (good)                                     │
│  - React Query (missing)                                    │
│  - Error boundary (incomplete)                              │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP (CORS, httpOnly cookies)
┌─────────────────────▼───────────────────────────────────────┐
│              API Gateway (Express.js)                        │
│  - Helmet (good)                                            │
│  - Rate limiting (good)                                     │
│  - ❌ NO GRACEFUL SHUTDOWN                                   │
│  - ❌ NO TRACING                                             │
│  - ❌ NO REQUEST ID PROPAGATION                              │
└──┬────────────────┬────────────────┬────────────────────────┘
   │                │                │
   │                │                └────────────────────┐
   │                │                                     │
┌──▼──┐       ┌─────▼──────┐       ┌──────────────┐  ┌──▼─────┐
│Auth │       │    Chat     │       │  Document    │  │ System │
│Svc  │       │    Svc      │       │  Svc         │  │ Svc    │
├─────┤       ├─────────────┤       ├──────────────┤  └────────┘
│ ❌  │       │ ❌ TIMING   │       │ ❌ RACE      │
│TIMING│      │ ATTACK      │       │ CONDITIONS   │
│ATTACK│      │ LEAKS USER  │       │              │
│      │      │             │       │ ❌ ORPHANED  │
│ ❌  │       │ ❌ NO       │       │ DOCUMENTS    │
│NO   │       │ CIRCUIT     │       │              │
│LOCKOUT │    │ BREAKER     │       │ ❌ NO TXNS   │
│      │      │             │       │              │
│ ❌  │       │ ❌ HALLUC   │       │              │
│CONST │      │ DETECTION   │       │              │
│TIME  │      │             │       │              │
└──┬───┘      └─────┬──────┘       └──────┬───────┘
   │                │                      │
   └────────────┬───┴──────────────────────┘
                │
   ┌────────────▼──────────┐
   │   Vector Search       │
   │  (In-Memory JSONStore)│
   ├───────────────────────┤
   │ ❌ O(N) search        │
   │ ❌ Unbounded memory   │
   │ ❌ Max 100K vectors   │
   │ ❌ Scale bottleneck   │
   └───────────┬───────────┘
               │
   ┌───────────▼───────────┐
   │  Supabase + Gemini    │
   │  - Auth (good)        │
   │  - ❌ NO CONNECTION   │
   │    POOLING            │
   │  - ❌ NO AUDITING     │
   │    VALIDATION         │
   │  - ❌ UNVALIDATED     │
   │    AUDIT LOGS         │
   └───────────────────────┘
```

### **Problems Visible in Current Architecture**

| Component | Problem | Impact |
|-----------|---------|--------|
| Auth | Timing attack leak | User enumeration |
| Auth | No account lockout | Brute force attacks |
| Chat/RAG | No hallucination detection | Confident false info |
| Chat/RAG | No circuit breaker | Cascading failures |
| Document | Race conditions | Data loss |
| Vector | O(N) search | Query latency, memory |
| Supabase | No connection pooling | Resource exhaustion |
| Supabase | Unvalidated audit logs | SQL injection risk |
| API | No graceful shutdown | Lost audit logs |
| API | No tracing | Debugging nightmare |

---

## **TARGET STATE (After All Fixes)**

```
┌──────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                         │
│  ✅ Zustand store                                             │
│  ✅ React Query + RTK Query                                  │
│  ✅ Error boundaries                                          │
│  ✅ Displays integrity scores                                │
│  ✅ Account lockout UI                                       │
└─────────────────────┬──────────────────────────────────────┘
                      │ HTTP (x-request-id header)
┌─────────────────────▼────────────────────────────────────────┐
│              API Gateway (Express.js)                         │
│  ✅ Helmet (security headers)                                 │
│  ✅ Rate limiting (IP + user-based)                          │
│  ✅ GRACEFUL SHUTDOWN (SIGTERM handler)                       │
│  ✅ DISTRIBUTED TRACING (OpenTelemetry)                       │
│  ✅ REQUEST ID PROPAGATION                                    │
│  ✅ CONSTANT-TIME AUTH                                        │
│  ✅ ACCOUNT LOCKOUT                                           │
└──┬────────────────┬────────────────┬────────────────────────┘
   │                │                │
   │                │                └────────────────────┐
   │                │                                     │
┌──▼──────────┐ ┌──▼──────────┐ ┌──────────────┐ ┌──────▼──┐
│Auth         │ │Chat         │ │Document      │ │System   │
│Svc          │ │Svc          │ │Svc           │ │Svc      │
├─────────────┤ ├─────────────┤ ├──────────────┤ └─────────┘
│✅ TIMING    │ │✅ HALLUC    │ │✅ TRANSACT   │
│   CONSTANT  │ │   DETECTION │ │   CONSISTENCY │
│             │ │   ENABLED   │ │              │
│✅ ACCOUNT   │ │             │ │✅ RACE COND  │
│   LOCKOUT   │ │✅ CIRCUIT   │ │   PREVENTION │
│             │ │   BREAKER   │ │              │
│✅ JWT       │ │             │ │✅ SAGA       │
│   SECURE    │ │✅ ANSWER    │ │   PATTERN    │
│             │ │   VALIDATION│ │              │
│✅ PASSWORD  │ │             │ │✅ ROLLBACK   │
│   MIGRATION │ │✅ INTEGRITY │ │              │
│   (Argon2)  │ │   SCORE     │ │              │
└──┬──────────┘ └─────┬───────┘ └──────┬───────┘
   │                  │                │
   │  ┌───────────────┴────────────────┤
   │  │                                │
   │  ▼    ┌─────────────────────┐     │
   │       │  Event Bus (Redis)  │     │
   │       │  - Audit events     │     │
   │       │  - Sync events      │     │
   │       │  - Error events     │     │
   │       └──────────┬──────────┘     │
   │                  │                │
   └──────────────┬───┴────────────────┘
                  │
        ┌─────────▼────────────────────┐
        │   Vector Search              │
        │   (Vertex AI Vector Search)  │
        ├──────────────────────────────┤
        │ ✅ O(log N) search           │
        │ ✅ 10M+ vectors              │
        │ ✅ <500ms p99 latency        │
        │ ✅ Managed scaling           │
        │ ✅ Access control filters    │
        └──────────┬────────────────────┘
                   │
        ┌──────────▼────────────────────┐
        │  Distributed Data Layer       │
        ├──────────────────────────────┤
        │ ✅ Supabase (PostgreSQL)      │
        │ ✅ Connection pooling         │
        │ ✅ Read replicas              │
        │ ✅ Immutable audit logs       │
        │ ✅ Validated schemas          │
        │ ✅ Service role security      │
        └──────────┬────────────────────┘
                   │
        ┌──────────▼────────────────────┐
        │  Observability Stack          │
        ├──────────────────────────────┤
        │ ✅ Jaeger (distributed tracing)
        │ ✅ Prometheus (metrics)       │
        │ ✅ Structured logging         │
        │ ✅ Audit trail               │
        │ ✅ Request correlation        │
        └───────────────────────────────┘
        
        ┌──────────────────────────────┐
        │  LLM Layer (Gemini)          │
        ├──────────────────────────────┤
        │ ✅ Circuit breaker           │
        │ ✅ Retry logic               │
        │ ✅ Timeout handling          │
        │ ✅ Cost limits               │
        │ ✅ Fallback responses        │
        └───────────────────────────────┘
```

### **Improvements in Target Architecture**

| Component | Before | After | Benefit |
|-----------|--------|-------|---------|
| Auth | Timing leak | Constant-time | No user enumeration |
| Auth | No lockout | 5-attempt lockout | Brute force blocked |
| Chat/RAG | No detection | Hallucination detector | Prevents false info |
| Chat/RAG | Cascade failures | Circuit breaker | Graceful degradation |
| Document | Race conditions | Transactional sagas | Data consistency |
| Vector | O(N) / 100K limit | O(log N) / 10M+ | Scales 100x |
| Supabase | No pooling | Pooled connections | No resource exhaustion |
| Audit | Unvalidated | Zod-validated | SQL injection safe |
| API | No shutdown | Graceful w/ flush | Zero data loss |
| API | No tracing | Full OpenTelemetry | 10x faster debugging |

---

## **DEPLOYMENT ARCHITECTURE**

### **Current (Single Container)**
```
┌─────────────────────────────────┐
│   Docker Container              │
│  ┌───────────────────────────┐  │
│  │   Node.js App (Single)    │  │
│  │  - All services in 1 proc │  │
│  │  - Hard to scale          │  │
│  │  - Kill = full downtime   │  │
│  └───────────────────────────┘  │
│                                 │
│   Volumes: JSON files           │
│            (vectors.json)       │
└────┬────────────────┬───────────┘
     │                │
     ▼                ▼
Supabase  GCP (Auth only)
```

### **Target (Scalable)**
```
Kubernetes Cluster (or Docker Compose)

┌──────────────────────────────────────────┐
│         Load Balancer                    │
│    (HAProxy or nginx)                    │
└────────┬────────────────┬────────────────┘
         │                │
    ┌────▼─────┐    ┌────▼─────┐
    │ API Pod 1│    │ API Pod 2 │
    │ - Handles │    │ - Handles │
    │ requests  │    │ requests  │
    └────┬─────┘    └────┬─────┘
         │                │
    ┌────▼────────────────▼─────┐
    │  Shared Data Layer        │
    │  - Supabase (replicated) │
    │  - Redis (session + cache)│
    │  - Vertex AI (vectors)   │
    └───────────────────────────┘
    
┌───────────────────────────────────┐
│  Observability (External)         │
│  - Jaeger                         │
│  - Prometheus                     │
│  - ELK Stack (Elasticsearch)     │
└───────────────────────────────────┘
```

---

## **DATA FLOW: P0 Fixes**

### **P0.1: Auth Request with Timing Protection**

```
User Login Request
        │
        ▼
┌─────────────────────────┐
│ 1. Query user by email  │
│    (variable time)      │
└────────┬────────────────┘
         │
         ▼
    ┌────────────────┐
    │ User found?    │
    └────┬───────┬──┘
         │       │
    YES  │       │ NO
         │       │
    ┌────▼─┐  ┌──▼──────────────┐
    │Real  │  │Use DUMMY_HASH   │
    │hash  │  │(same time as    │
    │      │  │ real failure)   │
    └────┬─┘  └──┬──────────────┘
         │       │
         └───┬───┘
             │
             ▼
    ┌──────────────────────┐
    │ 2. Argon2.verify()   │
    │    (500ms ± jitter)  │
    │    CONSTANT TIME     │
    └────────┬─────────────┘
             │
         ┌───┴────┐
         │        │
    Valid│        │Invalid
         │        │
    ┌────▼─┐ ┌───▼─────────────┐
    │Check │ │ Add jitter      │
    │active│ │ delay to ensure │
    └────┬─┘ │ min time (500ms)│
         │   └────┬────────────┘
    ┌────▼───────▼────────────┐
    │ 3. Add random delay     │
    │    (10-50ms extra)      │
    │    → STD DEV < 100ms    │
    └────────┬────────────────┘
             │
             ▼
    ┌──────────────────────┐
    │ Return user or null  │
    │ (timing indistinct)  │
    └──────────────────────┘
    
    ✅ Attacker can't tell if user exists based on timing
```

### **P0.2: Graceful Shutdown Flow**

```
Server Running
    │
    ▼ (Signal: SIGTERM or SIGINT)
┌────────────────────────┐
│ 1. Stop accepting      │
│    new connections     │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 2. Wait for in-flight  │
│    requests to finish  │
│    (with timeout)      │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 3. Flush audit logs    │
│    from buffer →       │
│    Supabase            │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 4. Flush vector cache  │
│    (if needed)         │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 5. Close connections   │
│    to external services│
└────────┬───────────────┘
         │
         ▼
    Process Exit (0)
    
    ⏱️ If timeout (30s) elapsed → Force exit (1)
    ✅ All in-flight data persisted
```

### **P0.3: Audit Log Validation**

```
Service wants to log event:
{
  userId: 'user-123',
  action: 'RAG_QUERY',
  query: 'What is ...?',
  metadata: {
    vectorCount: 42,
    duration: 234
  }
}
        │
        ▼
┌────────────────────────────┐
│ 1. Validate with Zod       │
├────────────────────────────┤
│ ✅ userId is UUID or 'anon'│
│ ✅ action in enum          │
│ ✅ query ≤ 2000 chars      │
│ ✅ reason ≤ 500 chars      │
│ ✅ metadata ≤ 10 keys      │
└────────┬──────────────────┘
         │
     ┌───┴─────┐
     │         │
  Valid    Invalid
     │         │
     │    ┌────▼──────┐
     │    │ Log error  │
     │    │ Silently   │
     │    │ drop entry │
     │    └────────────┘
     │
     ▼
┌────────────────────────────┐
│ 2. Add to buffer           │
│    (50 entry limit)        │
└────────┬──────────────────┘
         │
     ┌───┴─────────────┐
     │                 │
  Buffer <50       Buffer ≥50
     │                 │
     │            ┌────▼────┐
     │            │ Flush    │
     │            │ to DB    │
     │            └────┬─────┘
     │                 │
     └────────┬────────┘
              │
              ▼
    Supabase audit_logs table
    
    ✅ SQL injection impossible (parameterized)
    ✅ No unbounded growth (50-entry limit)
    ✅ Audit trail reliable
```

---

## **PERFORMANCE IMPROVEMENTS**

### **Vector Search Latency**

```
Current (JSONStore, O(N)):
┌─────────────────────────────────────────┐
│ 1K vectors:     10ms                    │
│ 10K vectors:    100ms                   │
│ 100K vectors:   1000ms (⚠️ SLOW)         │
│ 1M vectors:     10000ms (❌ TIMEOUT)     │
└─────────────────────────────────────────┘

Target (Vertex AI, O(log N)):
┌─────────────────────────────────────────┐
│ 1K vectors:     10ms                    │
│ 10K vectors:    12ms                    │
│ 100K vectors:   15ms  (✅ 67x faster)    │
│ 1M vectors:     18ms  (✅ 556x faster)   │
│ 10M vectors:    20ms  (✅ 500x faster)   │
└─────────────────────────────────────────┘
```

### **Memory Usage**

```
Current (In-Memory JSONStore):
┌─────────────────────────────────────────┐
│ 1K vectors:      50 MB                  │
│ 10K vectors:     500 MB                 │
│ 100K vectors:    5000 MB (⚠️ OOM risk)  │
│ 1M vectors:      50000 MB (❌ FAILS)    │
└─────────────────────────────────────────┘

Target (Vertex AI Vector Search):
┌─────────────────────────────────────────┐
│ 1K vectors:      2 MB (API call)        │
│ 10K vectors:     2 MB (API call)        │
│ 100K vectors:    2 MB (API call)        │
│ 1M vectors:      2 MB (API call)        │
│ 10M vectors:     2 MB (API call)        │
└─────────────────────────────────────────┘
```

---

**Architecture diagrams show the path from fragile to enterprise-grade.**

**Ready to build. Let's execute. 🚀**
