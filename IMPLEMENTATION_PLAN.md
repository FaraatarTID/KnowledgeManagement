# 🚀 AIKB Security & Architecture Fix Implementation Plan

**Last Updated:** January 31, 2026  
**Target Completion:** 8-10 weeks (assuming 1 full-time dev)  
**Risk Level:** Medium (fixes won't break existing functionality)

---

## **PHASE 0: EMERGENCY FIXES (This Week - 12 hours)**

These are showstoppers that expose production data immediately.

### **P0.1: Fix Timing Attack in Auth (4 hours)**

**Problem:** JWT validation leaks timing information about user existence.  
**File:** `server/src/services/auth.service.ts`  
**Risk:** User enumeration attacks, targeted credential stuffing

**Implementation:**
```typescript
// Current (vulnerable):
if (error || !data) {
  await argon2.verify(AuthService.DUMMY_HASH, password);
  return null; 
}

// Fixed (constant-time):
const verifyStart = Date.now();
const isValid = !error && data 
  ? await this.verifyPassword(password, data.password_hash)
  : await argon2.verify(AuthService.DUMMY_HASH, password);

// Ensure minimum constant time (Argon2 minimum ~300-500ms)
const elapsed = Date.now() - verifyStart;
const minTime = 500; // Tune based on your Argon2 config
if (elapsed < minTime) {
  const jitter = crypto.randomInt(10, 50);
  await new Promise(r => setTimeout(r, minTime - elapsed + jitter));
}

return isValid ? data : null;
```

**Testing:**
- Measure response time for non-existent user vs. wrong password (should be within 50ms)
- Run 100 requests, verify standard deviation < 100ms

**Checklist:**
- [ ] Update `validateCredentials()` method
- [ ] Add timing test in `auth.service.test.ts`
- [ ] Verify no timing leaks in JWT decode path
- [ ] Document constant-time expectations in comments

---

### **P0.2: Graceful Shutdown & Buffer Flushing (3 hours)**

**Problem:** Server kills in-flight requests, loses audit logs.  
**Files:** 
- `server/src/index.ts`
- `server/src/services/access.service.ts`

**Implementation:**

```typescript
// In index.ts (around line 120)
const server = app.listen(port, () => {
  Logger.info(`✅ SERVER ACTIVE ON PORT ${port}`);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  Logger.info('SIGTERM received - initiating graceful shutdown...');
  
  server.close(async () => {
    try {
      // Flush all pending audit logs
      await auditService.flush();
      Logger.info('Audit logs flushed successfully');
      
      // Flush any other buffers (sync service, etc.)
      await vectorService.flush?.();
      
      process.exit(0);
    } catch (err) {
      Logger.error('Graceful shutdown failed', { error: err });
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    Logger.error('Graceful shutdown timeout - forcing exit');
    process.exit(1);
  }, 30000);
});

process.on('SIGINT', () => process.emit('SIGTERM'));
```

```typescript
// In access.service.ts - Add maximum buffer size
private readonly MAX_BUFFER_SIZE = 500; // Prevent unbounded growth

async log(entry: {...}) {
  // ... existing code ...
  
  if (this.buffer.length >= this.MAX_BUFFER_SIZE) {
    Logger.warn('Audit buffer at max capacity, forcing flush');
    await this.flush(); // Synchronously block if needed
  }
  
  // ... rest of code ...
}

// Add public flush method
async flush(): Promise<void> {
  if (this.buffer.length === 0 || !this.supabase) return;
  
  const toFlush = [...this.buffer];
  this.buffer = [];
  
  if (this.flushTimer) {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
  }

  try {
    await this.supabase.from('audit_logs').insert(toFlush);
    Logger.debug(`Flushed ${toFlush.length} audit logs`);
  } catch (err) {
    // Re-add to buffer for retry
    this.buffer.unshift(...toFlush);
    Logger.error('Audit flush failed, re-queued', { error: err });
    throw err;
  }
}
```

**Testing:**
- [ ] Kill server with SIGTERM, verify no log loss
- [ ] Send HTTP request, kill mid-response, check buffer flushed
- [ ] Load test: 100 concurrent requests, SIGTERM, verify all logged
- [ ] Timeout test: SIGTERM never resolves, verify force-exit after 30s

**Checklist:**
- [ ] Add signal handlers to `index.ts`
- [ ] Add max buffer size to `access.service.ts`
- [ ] Add `flush()` method to `AuditService`
- [ ] Add shutdown tests
- [ ] Document graceful shutdown in DEPLOYMENT.md

---

### **P0.3: Validate Audit Log Entries (Zod) (2 hours)**

**Problem:** Arbitrary metadata in audit logs → SQL injection risk if migrated to raw SQL.  
**File:** `server/src/services/access.service.ts`

**Implementation:**

```typescript
// Add at top of access.service.ts
import { z } from 'zod';

const auditLogEntrySchema = z.object({
  userId: z.string().uuid().or(z.literal('anonymous')),
  action: z.enum(['RAG_QUERY', 'DOCUMENT_UPLOAD', 'AUTH_LOGIN', 'AUTH_LOGOUT', 'ACCESS_DENIED']),
  resourceId: z.string().uuid().optional(),
  query: z.string().max(2000).optional(),
  granted: z.boolean(),
  reason: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional().refine(
    (m) => m ? Object.keys(m).length <= 10 : true,
    'Metadata can have max 10 keys'
  )
});

async log(entry: z.infer<typeof auditLogEntrySchema>) {
  // Validate before processing
  const validated = auditLogEntrySchema.parse(entry);
  
  const logEntry = {
    user_id: validated.userId,
    action: validated.action,
    resource_id: validated.resourceId,
    query: validated.query,
    granted: validated.granted,
    reason: validated.reason,
    metadata: validated.metadata || {},
    created_at: new Date().toISOString()
  };

  // ... rest of existing code ...
}
```

**Testing:**
- [ ] Invalid action type → rejected
- [ ] Query > 2000 chars → rejected
- [ ] Metadata with 11 keys → rejected
- [ ] Valid entry → accepted

**Checklist:**
- [ ] Add Zod schema to `access.service.ts`
- [ ] Update `log()` method signature
- [ ] Add validation tests
- [ ] Update all call sites (should pass already)

---

## **PHASE 1: HIGH-PRIORITY SECURITY & STABILITY (Weeks 2-3 - 25 hours)**

### **P1.1: Replace In-Memory Vector Store (12 hours)**

**Problem:** O(N) vector search, unbounded memory growth, doesn't scale past 100K docs.  
**Current:** `server/src/services/vector.service.ts` uses JSONStore  
**Target:** Pinecone or Vertex AI Vector Search

**Decision Tree:**
```
Use Supabase pgvector?
  ✓ Cheap, already using Supabase
  ✗ pgvector is slow for 100K+ vectors
  
Use Pinecone?
  ✓ Managed, scales to billions
  ✓ Free tier: 100K vectors
  ✗ $0.01/100K vectors after free tier
  
Use Vertex AI Vector Search?
  ✓ Already have GCP credentials
  ✓ Native integration with Gemini embeddings
  ✓ Costs ~$1/month for <100K vectors
  ✗ Requires index deployment
  
RECOMMENDATION: Vertex AI Vector Search (you already have GCP setup)
```

**Phase 1a: Prepare Vertex AI (2 hours)**
- [ ] Create Vertex AI Vector Search index in GCP console
- [ ] Add env vars: `VERTEX_SEARCH_INDEX_ID`, `VERTEX_SEARCH_ENDPOINT`
- [ ] Create utility class `VertexVectorStore`

**Phase 1b: Implement New VectorService (6 hours)**
```typescript
// server/src/services/vectorStore.ts (NEW FILE)
import { MatchServiceClient } from '@google-cloud/aiplatform';

export class VertexVectorStore {
  private client: MatchServiceClient;
  private indexEndpoint: string;
  
  constructor(projectId: string, endpointId: string, indexId: string) {
    this.client = new MatchServiceClient({ projectId });
    this.indexEndpoint = `projects/${projectId}/locations/us-central1/indexEndpoints/${endpointId}`;
  }
  
  async upsertVectors(items: VectorItem[]): Promise<void> {
    const datapoints = items.map(item => ({
      id: item.id,
      featureVector: { values: item.values },
      metadata: [{ key: 'json', value: JSON.stringify(item.metadata) }]
    }));
    
    await this.client.upsertDatapoints({
      index: this.indexEndpoint,
      datapoints
    });
  }
  
  async search(
    embedding: number[],
    topK: number
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, any> }>> {
    const response = await this.client.findNeighbors({
      indexEndpoint: this.indexEndpoint,
      query: { featureVector: { values: embedding } },
      neighborCount: topK
    });
    
    return response[0].neighbors.map((n: any) => ({
      id: n.datapoint.id,
      score: n.distance,
      metadata: JSON.parse(n.datapoint.metadata[0].value)
    }));
  }
}
```

Then update `VectorService` to use this backend:
```typescript
// server/src/services/vector.service.ts (MODIFIED)
export class VectorService {
  private store: VertexVectorStore;
  
  constructor(projectId: string, endpointId: string, indexId: string) {
    this.store = new VertexVectorStore(projectId, endpointId, indexId);
  }
  
  async addItem(item: VectorItem): Promise<void> {
    await this.store.upsertVectors([item]);
  }
  
  async similaritySearch(params: {...}): Promise<...> {
    // No more manual O(N) search
    const results = await this.store.search(params.embedding, params.topK);
    
    // Apply access control filter on results
    return results.filter(r => {
      const vec = r.metadata;
      const userRole = params.filters?.role || '';
      const userDept = params.filters?.department || '';
      
      // Same access control logic, now post-retrieval
      return this.checkAccess(userRole, userDept, vec.sensitivity, vec.department);
    });
  }
}
```

**Phase 1c: Migration Script (4 hours)**
```typescript
// scripts/migrate-vectors-to-vertex.ts (NEW FILE)
// Reads all vectors from JSONStore, uploads to Vertex AI
async function migrateVectors() {
  const localStore = new JSONStore('data/vectors.json', []);
  const vertexStore = new VertexVectorStore(projectId, endpointId, indexId);
  
  const batch = [];
  for (const item of localStore.state) {
    batch.push(item);
    if (batch.length >= 100) {
      await vertexStore.upsertVectors(batch);
      batch.length = 0;
    }
  }
  if (batch.length > 0) await vertexStore.upsertVectors(batch);
  
  console.log('Migration complete');
}
```

**Testing:**
- [ ] Unit test: VertexVectorStore.search() returns top-K in score order
- [ ] Integration test: Upload 1000 vectors, search, verify results
- [ ] Performance test: 10K vectors, measure p99 search latency (should be <500ms)
- [ ] Backward compatibility: Old code still works with JSONStore fallback

**Checklist:**
- [ ] Create Vertex AI index in GCP
- [ ] Add Vertex AI SDK to `package.json`
- [ ] Implement `VertexVectorStore` class
- [ ] Update `VectorService` to use new backend
- [ ] Create migration script
- [ ] Document migration in DEPLOYMENT.md
- [ ] Run migration on staging first
- [ ] Add feature flag: `USE_VERTEX_VECTOR_STORE=true`
- [ ] Keep JSONStore as fallback for 1 week

---

### **P1.2: Add Distributed Request Tracing (8 hours)**

**Problem:** Can't correlate logs across services, debugging is nightmare.  
**Solution:** OpenTelemetry + Jaeger (free, self-hosted)

**Phase 1: Implement Tracing Infrastructure**

```typescript
// server/src/utils/tracing.ts (NEW FILE)
import { NodeTracerProvider } from '@opentelemetry/node';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { registerInstrumentations } from '@opentelemetry/auto-instrumentations-node';

export function initTracing() {
  const jaegerExporter = new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 'http://localhost:14268/api/traces',
  });

  const tracerProvider = new NodeTracerProvider();
  tracerProvider.addSpanProcessor(new BatchSpanProcessor(jaegerExporter));

  registerInstrumentations({
    tracerProvider,
  });

  return tracerProvider;
}
```

```typescript
// server/src/index.ts (MODIFIED - add at very top before other imports)
import { initTracing } from './utils/tracing.js';
if (process.env.NODE_ENV !== 'test') {
  initTracing();
}

// Rest of imports...
import express from 'express';
```

**Phase 2: Add Trace Context to Middleware**

```typescript
// server/src/middleware/context.middleware.ts (MODIFIED)
import { trace } from '@opentelemetry/api';

export const contextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const tracer = trace.getTracer('aikb-server');
  
  const requestId = req.headers['x-request-id'] as string || `req-${crypto.randomUUID().slice(0,8)}`;
  AsyncContext.setRequestId(requestId);
  
  const span = tracer.startSpan(`${req.method} ${req.url}`);
  span.setAttribute('http.method', req.method);
  span.setAttribute('http.url', req.url);
  span.setAttribute('request.id', requestId);
  span.setAttribute('http.client_ip', req.ip);
  
  res.setHeader('x-request-id', requestId);

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    span.setAttribute('http.status_code', res.statusCode);
    span.setAttribute('http.duration_ms', duration);
    span.end();
    
    // ... existing logging code ...
  });

  next();
};
```

**Phase 3: Add Traces to RAG Pipeline**

```typescript
// server/src/services/rag.service.ts (MODIFIED)
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('aikb-rag');

async query(params: {...}) {
  const span = tracer.startSpan('RAG.query');
  span.setAttribute('query.length', params.query.length);
  
  try {
    span.addEvent('embedding_generation_start');
    const queryEmbedding = await this.geminiService.generateEmbedding(params.query);
    span.addEvent('embedding_generation_complete', { 'embedding.dim': queryEmbedding.length });
    
    span.addEvent('vector_search_start');
    const searchResults = await this.vectorService.similaritySearch({...});
    span.addEvent('vector_search_complete', { 'results.count': searchResults.length });
    
    // ... rest of query logic ...
    
    span.setAttribute('query.success', true);
  } catch (err) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    throw err;
  } finally {
    span.end();
  }
}
```

**Testing:**
- [ ] Start Jaeger locally: `docker run -d -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one`
- [ ] Make API request, verify trace appears in Jaeger UI (http://localhost:16686)
- [ ] Trace shows request ID, all spans correlated
- [ ] Performance: tracing adds <5% latency

**Checklist:**
- [ ] Install OpenTelemetry packages: `npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-jaeger-http @opentelemetry/auto-instrumentations-node`
- [ ] Create `tracing.ts` utility
- [ ] Update `index.ts` to initialize tracing
- [ ] Add spans to `context.middleware.ts`
- [ ] Add spans to `rag.service.ts`, `auth.service.ts`, `chat.service.ts`
- [ ] Update `.env.example` with `JAEGER_ENDPOINT`
- [ ] Add Jaeger docker-compose to docs
- [ ] Add tracing tests

---

### **P1.3: Implement RAG Hallucination Detection (5 hours)**

**Problem:** System returns confident false information.  
**Solution:** Multi-layer answer validation

```typescript
// server/src/services/hallucination.service.ts (NEW FILE)
export class HallucinationDetector {
  /**
   * Verify that answer quotes are actually in the source documents
   */
  async verifyQuotes(
    answer: string,
    sources: string[]
  ): Promise<{
    isValid: boolean;
    verified: string[];
    hallucinated: string[];
    confidence: number;
  }> {
    const sentences = answer.match(/[^.!?]+[.!?]+/g) || [];
    const verified: string[] = [];
    const hallucinated: string[] = [];

    for (const sentence of sentences) {
      const cleaned = sentence.trim();
      
      // Check if sentence appears (or close paraphrase) in sources
      const found = sources.some(source => 
        source.toLowerCase().includes(cleaned.toLowerCase().substring(0, 50))
      );
      
      if (found) {
        verified.push(cleaned);
      } else {
        hallucinated.push(cleaned);
      }
    }

    const confidence = verified.length / sentences.length;
    return {
      isValid: confidence > 0.7, // 70% must be verified
      verified,
      hallucinated,
      confidence
    };
  }

  /**
   * Detect self-contradictions in the answer
   */
  detectContradictions(answer: string): {
    hasContradictions: boolean;
    conflictPairs: Array<{ claim1: string; claim2: string }>;
  } {
    // Simple heuristic: look for "but", "however", "contrary"
    const sentences = answer.match(/[^.!?]+[.!?]+/g) || [];
    const conflictPairs = [];

    for (let i = 0; i < sentences.length - 1; i++) {
      const current = sentences[i].toLowerCase();
      const next = sentences[i + 1].toLowerCase();
      
      if ((next.includes('but') || next.includes('however')) &&
          current.includes('not') && next.includes('is')) {
        conflictPairs.push({ claim1: sentences[i].trim(), claim2: sentences[i + 1].trim() });
      }
    }

    return {
      hasContradictions: conflictPairs.length > 0,
      conflictPairs
    };
  }

  /**
   * Check if answer matches expected format/schema
   */
  validateResponseStructure(answer: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (answer.length < 20) issues.push('Answer too short');
    if (answer.length > 5000) issues.push('Answer too long');
    if (!answer.match(/[A-Z]/)) issues.push('No capitalization');
    if (answer.includes('[REDACTED]') && answer.split('[REDACTED]').length > 5) {
      issues.push('Too much redacted content');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}
```

**Integration with RAG Service:**

```typescript
// server/src/services/rag.service.ts (MODIFIED)
export class RAGService {
  private hallucinator: HallucinationDetector;
  
  constructor(...args) {
    // ... existing code ...
    this.hallucinator = new HallucinationDetector();
  }
  
  async query(params: {...}) {
    // ... existing code up to answer generation ...
    
    const { text, usageMetadata } = await this.geminiService.queryKnowledgeBase({...});
    
    // VERIFY INTEGRITY
    const quoteVerification = await this.hallucinator.verifyQuotes(text, context);
    const contradictions = this.hallucinator.detectContradictions(text);
    const structureValidation = this.hallucinator.validateResponseStructure(text);
    
    const integrityScore = (
      quoteVerification.confidence * 0.6 +  // 60% weight to quote verification
      (contradictions.hasContradictions ? 0 : 1) * 0.2 +  // 20% to no contradictions
      (structureValidation.isValid ? 1 : 0) * 0.2  // 20% to structure
    );
    
    // If integrity too low, downgrade confidence or return neutral answer
    if (integrityScore < 0.5) {
      return {
        answer: "I found relevant documents, but I'm not confident enough to summarize them. Here are the sources instead.",
        sources: citations,
        integrity: {
          confidence: 'LOW',
          isVerified: false,
          score: integrityScore,
          reasons: [
            ...quoteVerification.hallucinated.slice(0, 2),
            ...structureValidation.issues
          ]
        }
      };
    }
    
    return {
      answer: text,
      sources: citations,
      integrity: {
        confidence: integrityScore > 0.85 ? 'HIGH' : 'MEDIUM',
        isVerified: true,
        score: integrityScore,
        verifiedQuotes: quoteVerification.verified.length,
        hallucinatedClaims: quoteVerification.hallucinated.length
      }
    };
  }
}
```

**Testing:**
- [ ] Test verifyQuotes: answer with 100% sourced content → confidence = 1.0
- [ ] Test verifyQuotes: answer with 50% sourced content → confidence = 0.5
- [ ] Test detectContradictions: conflicting statements detected
- [ ] Test validateResponseStructure: empty answer fails, normal answer passes
- [ ] Integration test: RAG query returns integrity metrics

**Checklist:**
- [ ] Create `hallucination.service.ts`
- [ ] Integrate into `RAGService.query()`
- [ ] Update response type to include integrity metrics
- [ ] Update frontend to display integrity score
- [ ] Add tests for each validation method
- [ ] Document integrity score interpretation

---

### **P1.4: Account Lockout After Failed Logins (3 hours)**

**Problem:** No protection against brute force (even with rate limiting).

```typescript
// server/src/services/auth.service.ts (ADD NEW METHOD)
// Track failed attempts in-memory (or Redis in production)
private failedAttempts = new Map<string, { count: number; lastAttempt: number }>();
private readonly MAX_FAILED_ATTEMPTS = 5;
private readonly LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

async validateCredentials(email: string, password: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase().trim();
  
  // Check if account is locked
  const attempts = this.failedAttempts.get(normalizedEmail);
  if (attempts && attempts.count >= this.MAX_FAILED_ATTEMPTS) {
    const timeSinceLast = Date.now() - attempts.lastAttempt;
    if (timeSinceLast < this.LOCKOUT_DURATION_MS) {
      const minutesLeft = Math.ceil((this.LOCKOUT_DURATION_MS - timeSinceLast) / 60000);
      throw new AppError(
        `Account temporarily locked. Try again in ${minutesLeft} minutes.`,
        429
      );
    } else {
      // Lockout expired, reset
      this.failedAttempts.delete(normalizedEmail);
    }
  }

  // ... existing validation code ...
  
  if (!isValid) {
    // Increment failed attempts
    const current = this.failedAttempts.get(normalizedEmail) || { count: 0, lastAttempt: 0 };
    current.count++;
    current.lastAttempt = Date.now();
    this.failedAttempts.set(normalizedEmail, current);
    
    // Log security event
    await this.auditService.log({
      userId: normalizedEmail,
      action: 'AUTH_LOGIN_FAILED',
      granted: false,
      reason: `Failed attempt ${current.count}/${this.MAX_FAILED_ATTEMPTS}`,
      metadata: { attemptCount: current.count }
    });
    
    return null;
  }

  // Success: Clear failed attempts
  this.failedAttempts.delete(normalizedEmail);
  return user;
}
```

**Production Upgrade (Future):** Replace Map with Redis:
```typescript
// Use Redis for distributed lockout
private redis: RedisClient;

async validateCredentials(email: string, password: string): Promise<User | null> {
  const lockoutKey = `auth:lockout:${email.toLowerCase()}`;
  const attempts = await this.redis.incr(`auth:attempts:${email.toLowerCase()}`);
  
  if (attempts > this.MAX_FAILED_ATTEMPTS) {
    const ttl = await this.redis.ttl(lockoutKey);
    if (ttl > 0) {
      throw new AppError(`Account locked for ${ttl} seconds`, 429);
    }
  }
  
  // ... rest of validation ...
  
  if (!isValid) {
    await this.redis.expire(`auth:attempts:${email.toLowerCase()}`, this.LOCKOUT_DURATION_MS / 1000);
    return null;
  }
  
  await this.redis.del(`auth:attempts:${email.toLowerCase()}`);
  return user;
}
```

**Testing:**
- [ ] 5 failed logins → 6th attempt locked
- [ ] Wait 15 minutes → can login again
- [ ] Successful login clears counter
- [ ] Concurrent requests don't race (map synchronized)

**Checklist:**
- [ ] Add failed attempt tracking to `AuthService`
- [ ] Update `validateCredentials()` method
- [ ] Add auth failure audit logs
- [ ] Test account lockout scenarios
- [ ] Document lockout behavior in user guide

---

## **PHASE 2: MEDIUM-PRIORITY FIXES (Weeks 4-6 - 35 hours)**

### **P2.1: Transactional Consistency in Document Operations (10 hours)**

**Problem:** Document upload succeeds but vector sync fails → orphaned data

**Solution:** Implement saga pattern or transaction wrapper

```typescript
// server/src/services/transaction.service.ts (NEW FILE)
export class TransactionManager {
  private rollbacks: Array<() => Promise<void>> = [];

  async execute<T>(callback: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const context = new TransactionContext();
    
    try {
      const result = await callback(context);
      return result;
    } catch (error) {
      // Rollback in reverse order
      for (let i = this.rollbacks.length - 1; i >= 0; i--) {
        try {
          await this.rollbacks[i]();
        } catch (rollbackErr) {
          Logger.error('Rollback failed', { error: rollbackErr });
        }
      }
      throw error;
    }
  }

  registerRollback(fn: () => Promise<void>): void {
    this.rollbacks.push(fn);
  }
}

export class TransactionContext {
  documentId?: string;
  vectorIds: string[] = [];
  auditId?: string;

  registerRollback(fn: () => Promise<void>): void {
    // Registered in TransactionManager
  }
}
```

**Update Document Upload Flow:**

```typescript
// server/src/controllers/document.controller.ts (MODIFIED)
static upload: RequestHandler = catchAsync(async (req: AuthRequest, res: Response) => {
  const tx = new TransactionManager();
  
  const result = await tx.execute(async (context) => {
    // Step 1: Save document metadata
    const docId = uuid();
    const docMetadata = {
      id: docId,
      title: req.file.originalname,
      ownerId: req.user!.id,
      status: 'PENDING_VECTORIZATION'
    };
    
    await documentService.create(docMetadata);
    context.documentId = docId;
    tx.registerRollback(async () => {
      await documentService.delete(docId);
    });
    
    // Step 2: Extract text from file
    const content = await extractionService.extractText(req.file.path);
    
    // Step 3: Generate embeddings and add to vector store
    const embedding = await geminiService.generateEmbedding(content);
    const vectorId = `vec-${docId}`;
    await vectorService.addItem({
      id: vectorId,
      values: embedding,
      metadata: { docId, title: docMetadata.title, text: content }
    });
    context.vectorIds.push(vectorId);
    
    tx.registerRollback(async () => {
      await vectorService.deleteItem(vectorId);
    });
    
    // Step 4: Update document status
    await documentService.update(docId, { status: 'VECTORIZED' });
    
    // All steps succeeded
    return { docId, status: 'success' };
  });
  
  res.json(result);
});
```

**Testing:**
- [ ] Interrupt at each step, verify rollback works
- [ ] Database state consistent after rollback
- [ ] Vector store state consistent after rollback
- [ ] No orphaned vectors after failed upload
- [ ] Audit logs record transaction lifecycle

**Checklist:**
- [ ] Create `transaction.service.ts`
- [ ] Update document controller to use transactions
- [ ] Update sync service to use transactions
- [ ] Add transaction tests
- [ ] Document transaction pattern in architecture doc

---

### **P2.2: Connection Pooling for Supabase (4 hours)**

**Problem:** Multiple Supabase clients drain connection pool.

```typescript
// server/src/utils/supabaseClient.ts (NEW FILE)
import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('FATAL: Supabase credentials missing');
    }

    supabaseInstance = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabaseInstance;
}

export async function closeSupabaseClient(): Promise<void> {
  if (supabaseInstance) {
    // Note: Supabase doesn't have explicit close, but we null it
    supabaseInstance = null;
  }
}
```

**Update Services to Use Singleton:**

```typescript
// server/src/services/auth.service.ts (MODIFIED)
import { getSupabaseClient } from '../utils/supabaseClient.js';

export class AuthService {
  private supabase: SupabaseClient;
  
  constructor() {
    this.supabase = getSupabaseClient();
  }
  // ... rest of class ...
}

// Apply same pattern to:
// - access.service.ts
// - history.service.ts
// - userService.ts
```

**Testing:**
- [ ] Verify only one Supabase client created
- [ ] Multiple services share same connection pool
- [ ] Connection count stays constant under load
- [ ] No "too many connections" errors under 100 concurrent reqs

**Checklist:**
- [ ] Create `supabaseClient.ts` singleton
- [ ] Update all services to use singleton
- [ ] Add connection pool monitoring
- [ ] Document connection pooling in deployment guide

---

### **P2.3: Improve PII Redaction (8 hours)**

**Problem:** Current redaction misses credit cards, IBANs, context-based names.

```typescript
// server/src/services/redaction.service.ts (REWRITTEN)
export class RedactionService {
  private patterns = {
    // Email (already good)
    email: /[a-zA-Z0-9._%+-]+(?:@|\s*\[at\]\s*|\s*\(at\)\s*)[a-zA-Z0-9.-]+(?:\.|\s*\[dot\]\s*|\s*\(dot\)\s*)[a-zA-Z]{2,}/gi,
    
    // Phone (improved - ReDoS safe)
    phone: /(?:\+\d{1,3})?\s?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    
    // Credit card (Visa/Mastercard/Amex/Discover)
    creditCard: /(?:\d{4}[\s-]?){3}\d{3,4}\b/g,
    
    // IBAN (Europe)
    iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{1,30}\b/g,
    
    // SSN (US)
    ssn: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    
    // Passport
    passport: /\b[A-Z]{1,2}\d{6,9}\b/gi,
    
    // Medical record IDs
    medicalId: /\b[MR]?R?\d{8,12}\b/g,
    
    // Bank account (simplified)
    bankAccount: /account\s+(?:number|#)[\s:]*(\d{8,17})/gi,
    
    // IP addresses (sometimes sensitive)
    ipAddress: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    
    // API keys / secrets (rough heuristic)
    apiKey: /(?:api[_-]?)?(?:key|token|secret|password)[\s:=]*[a-zA-Z0-9]{32,}/gi,
  };

  redactPII(content: string): string {
    let redacted = content;

    // Apply all patterns
    for (const [type, pattern] of Object.entries(this.patterns)) {
      redacted = redacted.replace(pattern, `[${type.toUpperCase()} REDACTED]`);
    }

    // Context-based redaction: names (simple heuristic)
    // Look for "X's" or "X said" where X is a capitalized word
    redacted = redacted.replace(/\b([A-Z][a-z]+)'s\b/g, '[NAME]\'s');
    redacted = redacted.replace(/\b([A-Z][a-z]+) said\b/gi, '[NAME] said');

    return redacted;
  }

  // Test if content has sensitive data (for flagging)
  hasSensitiveData(content: string): boolean {
    for (const pattern of Object.values(this.patterns)) {
      if (pattern.test(content)) return true;
    }
    return false;
  }

  // Get summary of detected PII
  detectPII(content: string): Record<string, number> {
    const detected: Record<string, number> = {};

    for (const [type, pattern] of Object.entries(this.patterns)) {
      const matches = content.match(pattern);
      if (matches) {
        detected[type] = matches.length;
      }
    }

    return detected;
  }
}
```

**Add to RAG Pipeline:**

```typescript
// server/src/services/rag.service.ts (MODIFIED)
async query(params: {...}) {
  const redactedQuery = this.redactionService.redactPII(params.query);
  
  // Log if PII was detected
  const piiDetected = this.redactionService.detectPII(params.query);
  if (Object.keys(piiDetected).length > 0) {
    await this.auditService.log({
      userId: params.userId,
      action: 'PII_DETECTED_IN_QUERY',
      granted: true,
      metadata: { piiTypes: piiDetected }
    });
  }
  
  // ... rest of query ...
}
```

**Testing:**
- [ ] Credit card 1234-5678-9012-3456 → redacted
- [ ] IBAN DE89370400440532013000 → redacted
- [ ] Bank account number in context → redacted
- [ ] API key sk-abc...xyz → redacted
- [ ] "John's report" → "[NAME]'s report"
- [ ] Context not destroyed (grammar intact)
- [ ] False positives minimal

**Checklist:**
- [ ] Add all pattern definitions
- [ ] Implement `hasSensitiveData()` and `detectPII()`
- [ ] Update RAG service to log PII detection
- [ ] Add comprehensive redaction tests
- [ ] Document PII types handled

---

### **P2.4: Add Circuit Breaker for Gemini API (6 hours)**

**Problem:** Gemini is slow → entire system hangs.

```typescript
// server/src/utils/circuitBreaker.ts (NEW FILE)
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN' // Testing if recovered
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly successThreshold = 2,
    private readonly timeout = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      const timeSinceFail = Date.now() - (this.lastFailureTime || 0);
      if (timeSinceFail > this.timeout) {
        this.state = CircuitState.HALF_OPEN;
        this.successCount = 0;
      } else {
        throw new Error(`Circuit breaker OPEN. Retry in ${Math.ceil((this.timeout - timeSinceFail) / 1000)}s`);
      }
    }

    try {
      const result = await fn();

      // Success
      if (this.state === CircuitState.HALF_OPEN) {
        this.successCount++;
        if (this.successCount >= this.successThreshold) {
          this.reset();
        }
      } else {
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.failureCount >= this.failureThreshold) {
        this.state = CircuitState.OPEN;
      }

      throw error;
    }
  }

  private reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }

  getState(): CircuitState {
    return this.state;
  }
}
```

**Apply to GeminiService:**

```typescript
// server/src/services/gemini.service.ts (MODIFIED)
import { CircuitBreaker } from '../utils/circuitBreaker.js';

export class GeminiService {
  private breaker: CircuitBreaker;

  constructor(projectId: string) {
    // ... existing code ...
    this.breaker = new CircuitBreaker(
      5,    // Fail after 5 consecutive errors
      2,    // Succeed twice to close
      60000 // 60 second timeout
    );
  }

  async queryKnowledgeBase(params: {...}) {
    return this.breaker.execute(async () => {
      // ... existing Gemini API call ...
    });
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.breaker.execute(async () => {
      // ... existing embedding call ...
    });
  }
}
```

**Update RAG to Handle Failures:**

```typescript
// server/src/services/rag.service.ts (MODIFIED)
async query(params: {...}) {
  try {
    const queryEmbedding = await this.geminiService.generateEmbedding(params.query);
    // ... rest of query ...
  } catch (error: any) {
    if (error.message.includes('Circuit breaker OPEN')) {
      return {
        answer: 'The AI service is temporarily unavailable. Please try again in a minute.',
        sources: [],
        integrity: { confidence: 'UNAVAILABLE', isVerified: false }
      };
    }
    throw error;
  }
}
```

**Testing:**
- [ ] 5 failures → circuit OPEN
- [ ] Circuit OPEN → requests immediately rejected (no delay)
- [ ] After timeout → try again (HALF_OPEN)
- [ ] 2 successes → circuit CLOSED
- [ ] User gets graceful error message

**Checklist:**
- [ ] Create `circuitBreaker.ts` utility
- [ ] Add to `GeminiService`
- [ ] Update RAG to handle circuit open errors
- [ ] Add circuit breaker tests
- [ ] Monitor circuit state in health endpoint

---

### **P2.5: Harden Docker Image (5 hours)**

**File:** `server/Dockerfile`

```dockerfile
# Multi-stage build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Final stage - minimal image
FROM node:22-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json

# Copy entrypoint script
COPY --chown=nodejs:nodejs docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Graceful shutdown signal
STOPSIGNAL SIGTERM

# Run app
ENTRYPOINT ["./docker-entrypoint.sh"]
```

```bash
# docker-entrypoint.sh
#!/bin/sh
set -e

# Wait for Supabase if needed
if [ -n "$WAIT_FOR_DB" ]; then
  echo "Waiting for database..."
  # Add your wait logic here
fi

# Execute main process
exec node dist/index.js
```

**Testing:**
- [ ] Image size < 300MB
- [ ] Non-root user confirmed
- [ ] Health check responds
- [ ] SIGTERM triggers graceful shutdown
- [ ] No secrets in image layers

**Checklist:**
- [ ] Update `Dockerfile` with multi-stage build
- [ ] Create `docker-entrypoint.sh`
- [ ] Add health check
- [ ] Test non-root execution
- [ ] Verify signal handling
- [ ] Update docker-compose.yml with health check

---

## **PHASE 3: NICE-TO-HAVE IMPROVEMENTS (Weeks 7-10 - 20 hours)**

### **P3.1: Remove `as any` Type Assertions (10 hours)**

**Find all occurrences:**
```bash
grep -r "as any" server/src --include="*.ts"
```

**Create proper types:**

```typescript
// server/src/types/vector.types.ts (NEW FILE)
export interface VectorMetadata {
  docId: string;
  title: string;
  text: string;
  sensitivity: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'EXECUTIVE';
  department?: string;
  category?: string;
  owner?: string;
  link?: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: VectorMetadata;
}
```

Then replace:
```typescript
// OLD:
const citations = relevantResults.slice(0, context.length).map(r => ({
  id: (r.metadata as any).docId,  // ❌
  title: (r.metadata as any).title,
}));

// NEW:
const citations = relevantResults.slice(0, context.length).map(r => ({
  id: r.metadata.docId,  // ✅ Type-safe
  title: r.metadata.title,
}));
```

**Checklist:**
- [ ] Find all `as any` instances
- [ ] Create proper types for each
- [ ] Replace with typed versions
- [ ] Enable strict TypeScript checks: `"strict": true` in tsconfig.json
- [ ] Fix any remaining type errors
- [ ] Add pre-commit hook to prevent new `as any`

---

### **P3.2: Implement Integration Tests for Critical Paths (8 hours)**

**Test scenarios:**
- [ ] User login → RAG query → vector search → answer returned (end-to-end)
- [ ] Document upload → extraction → vectorization → search finds it
- [ ] Concurrent uploads don't create duplicates/orphans
- [ ] Timing attack mitigation (all logins take ~500ms)
- [ ] Circuit breaker opens and closes properly
- [ ] Audit logs capture all sensitive operations

**Example structure:**

```typescript
// server/src/__tests__/integration/rag-query.integration.test.ts
describe('RAG Query Integration', () => {
  beforeEach(async () => {
    // Setup test database
    // Setup test vectors
  });

  it('should query documents and return answer', async () => {
    const response = await api.post('/api/v1/query', {
      query: 'What is the company policy?'
    }, {
      headers: { 'Authorization': `Bearer ${testToken}` }
    });

    expect(response.status).toBe(200);
    expect(response.body.answer).toBeDefined();
    expect(response.body.sources).toBeInstanceOf(Array);
    expect(response.body.integrity.confidence).toMatch(/HIGH|MEDIUM|LOW/);
  });

  it('should redact PII from answers', async () => {
    // Upload document with PII
    // Query
    // Verify PII is redacted in response
  });

  it('should enforce access control', async () => {
    // Query as viewer
    // Should not see RESTRICTED documents
  });
});
```

---

### **P3.3: Compliance & Audit Documentation (2 hours)**

**Create:**
- [ ] `SECURITY_AUDIT.md` - Vulnerability checklist
- [ ] `COMPLIANCE_MAPPING.md` - GDPR/SOC 2/ISO 27001 controls
- [ ] `INCIDENT_RESPONSE.md` - What to do if breached
- [ ] `DATA_RETENTION_POLICY.md` - How long we keep audit logs
- [ ] Security headers documentation

---

## **TESTING & VALIDATION STRATEGY**

### **Test Coverage Target: 85%+**

```
Coverage by Component:
- Auth: 95% (security critical)
- RAG: 90% (main feature, hallucination is important)
- Vector: 85% (performance impacts UX)
- Document: 80% (file handling, less complex)
- Middleware: 90% (security critical)
```

### **Security Testing**

```bash
# OWASP Top 10 checklist
✓ A01: Broken Access Control     (P0-P1 fixes)
✓ A02: Cryptographic Failures    (timing attack, JWT)
✓ A03: Injection                 (Zod validation, audit log schema)
✓ A04: Insecure Design           (RAG hallucination detection)
✓ A05: Security Misconfiguration (CORS, headers)
? A06: Vulnerable Components     (dependency scanning needed)
✓ A07: Authentication Failures   (account lockout)
? A08: Data Integrity Failures   (transactional consistency)
✓ A09: Logging Gaps              (distributed tracing)
✓ A10: SSRF                      (not applicable to this system)
```

### **Load Testing**

```bash
# 100 concurrent users
k6 run loadtest.js --vus 100 --duration 5m

Expected metrics:
- p99 latency: <2s (RAG query)
- p99 latency: <500ms (auth)
- Error rate: 0%
- Memory growth: <100MB over 5m
```

---

## **DEPLOYMENT STRATEGY**

### **Rollout Plan**

```
Week 1:  P0 fixes → Deploy to staging → QA testing
Week 2:  P1.1 (Vector store) → Feature flag (USE_VERTEX_SEARCH=false by default)
         P1.2 (Tracing) → Deploy to prod (non-blocking)
         P1.3 (Hallucination) → Deploy to prod
Week 3:  P1.4 (Account lockout) → Deploy to prod
Week 4:  P2 fixes incrementally
```

### **Feature Flags**

```typescript
// Always test new features behind flags
if (env.FEATURE_VERTEX_VECTOR_SEARCH === 'true') {
  vectorService = new VectorService(vertexConfig);
} else {
  vectorService = new VectorService(jsonStoreConfig); // Fallback
}
```

### **Monitoring After Deployment**

```
- Error rate threshold: >1% → auto-rollback
- Latency threshold: p99 > 5s → alert
- Memory threshold: >1GB → alert
- Audit log failure rate: >5% → alert
```

---

## **EFFORT ESTIMATE SUMMARY**

| Phase | Tasks | Effort | Team | Duration |
|-------|-------|--------|------|----------|
| **P0** | 3 critical fixes | 12h | 1 dev | 2 days |
| **P1** | Security + stability | 25h | 1-2 devs | 2 weeks |
| **P2** | Medium-priority | 35h | 1-2 devs | 3 weeks |
| **P3** | Polish + compliance | 20h | 1 dev | 2 weeks |
| **Testing** | Unit + integration + security | 30h | 1 QA | Ongoing |
| **Docs** | Technical + user | 15h | 1 tech writer | Ongoing |
| **TOTAL** | All phases | **137 hours** | 1-2 devs | **8-10 weeks** |

---

## **SUCCESS CRITERIA**

By end of this plan, system will meet:

✅ **Security**
- [ ] No timing attack vectors (constant-time auth)
- [ ] No SQL injection (parameterized queries, Zod validation)
- [ ] No uncontrolled file uploads
- [ ] No auth bypass (legacy endpoints protected)
- [ ] Account lockout after N failed attempts
- [ ] PII redacted from LLM inputs/outputs
- [ ] Distributed tracing for incident investigation
- [ ] Audit logs immutable and tamper-proof

✅ **Reliability**
- [ ] Graceful shutdown with buffer flushing
- [ ] Circuit breaker prevents cascading failures
- [ ] Transactional consistency in multi-step ops
- [ ] Connection pooling prevents resource exhaustion
- [ ] Health checks pass under 100 concurrent users

✅ **Scalability**
- [ ] Vector search scales to 10M+ documents (Vertex AI)
- [ ] O(log N) query latency instead of O(N)
- [ ] <500ms p99 latency for RAG queries
- [ ] Horizontal scaling ready (stateless design)

✅ **Maintainability**
- [ ] Type safety > 95%
- [ ] Test coverage > 85%
- [ ] Clear error messages for debugging
- [ ] Distributed traces correlate requests across services
- [ ] Architecture documentation updated

---

## **DEPENDENCIES & BLOCKERS**

**External:**
- GCP Vertex AI Vector Search setup (requires GCP access)
- Jaeger instance for tracing (can use docker-compose)
- Supabase access for schema migrations

**Internal:**
- P0.1 (timing attack) must be before scaling auth
- P0.2 (graceful shutdown) must be before P2 (transactions)
- P1.1 (vector store) should be before load testing

---

## **HOW TO TRACK PROGRESS**

1. **Kanban board:** Create GitHub Project with Phase0 / Phase1 / Phase2 / Phase3 columns
2. **PR checklist:** Each fix is a separate PR with security review
3. **Daily standups:** What's done, what's blocked, risks?
4. **Staging validation:** Each phase validated on staging before prod
5. **Incident tracking:** Log any issues found during implementation

---

**Last Updated:** 2026-01-31  
**Next Review:** After P0 completion (Feb 7)  
**Owner:** Your team lead / security engineer
