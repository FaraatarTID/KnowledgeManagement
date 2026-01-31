# Integration & Deployment Guide

## Overview

This document provides step-by-step instructions for integrating the Phase 0-2 implementations into production, configuring services, and deploying the system.

## Prerequisites

- Node.js 18.x or higher
- PostgreSQL 14+
- Google Cloud Project with Vertex AI enabled
- Service account credentials for Google Cloud
- Docker (optional, for containerization)

## Database Setup

### 1. Run Migrations

Apply all database migrations in order:

```bash
# Phase 1.3: Account lockout support
psql -U postgres -d knowledge_management -f server/supabase/migrations/20250122_add_account_lockout.sql
```

### 2. Verify Schema

Check that users table has new fields:

```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;
```

Expected columns: `id`, `email`, `password_hash`, `name`, `role`, `department`, `status`, `created_at`, `updated_at`, `failed_login_attempts`, `locked_until`

## Environment Configuration

### Set Required Environment Variables

Create `.env` file in `server/` directory:

```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project
GCP_REGION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# Gemini API
GEMINI_MODEL=gemini-2.5-flash-lite-001
EMBEDDING_MODEL=text-embedding-004

# RAG Configuration
RAG_MIN_SIMILARITY=0.6 # 60% similarity threshold
RAG_MAX_CONTEXT_CHARS=15000 # 15k chars max context

# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Security
JWT_SECRET=your-jwt-secret-min-32-chars
ENCRYPTION_KEY=your-encryption-key
```

### Optional: Advanced Configuration

```bash
# Timeouts (milliseconds)
VECTOR_SEARCH_TIMEOUT=15000
EMBEDDING_TIMEOUT=30000
RAG_QUERY_TIMEOUT=60000

# Cache Sizes
VECTOR_CACHE_SIZE=500
EMBEDDING_CACHE_SIZE=10000
METADATA_CACHE_SIZE=2000

# Retry Configuration
RETRY_MAX_ATTEMPTS=5
RETRY_BACKOFF_MULTIPLIER=2

# Health Check Interval
HEALTH_CHECK_INTERVAL=30000
```

## Service Integration

### 1. Configure Vertex AI Vector Search

Setup in Google Cloud Console:

```bash
# Enable APIs
gcloud services enable aiplatform.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable monitoring.googleapis.com

# Create vector index
gcloud ai indexes create \
  --display-name="km-vectors" \
  --project=YOUR_PROJECT_ID \
  --region=us-central1 \
  --index-config-file=index-config.json
```

**index-config.json:**
```json
{
  "displayName": "km-vectors",
  "metadata": {
    "contentsDeltaUri": "gs://your-bucket/vectors/",
    "config": {
      "dimensions": 1536,
      "approximateNeighborsCount": 150,
      "shardSize": "SHARD_SIZE_SMALL",
      "distanceMeasureType": "SQUARED_L2_DISTANCE"
    }
  }
}
```

### 2. Configure Health Checks

In `server/src/index.ts`, register service health checks:

```typescript
const healthCheck = new HealthCheckUtil();

// Register checks for each service
healthCheck.register('vector-store', async () => {
  const health = await vectorService.checkHealth();
  return health.status === 'OK';
});

healthCheck.register('gemini-api', async () => {
  const health = await geminiService.checkHealth();
  return health.status === 'OK';
});

healthCheck.register('database', async () => {
  // Test database connection
  return await checkDatabaseConnection();
});

// Add health endpoint
app.get('/health', createHealthCheckEndpoint(healthCheck));
app.get('/metrics', (req, res) => {
  res.json(getMetricsSummary());
});
```

### 3. Add Metrics Collection

In route handlers, collect metrics:

```typescript
// In RAG query controller
import { metrics, MetricNames } from '../utils/metrics.util.js';

app.post('/query', asyncHandler(async (req, res) => {
  const startTime = Date.now();
  metrics.increment(MetricNames.RAG_QUERY);

  try {
    const result = await ragService.query(req.body);
    metrics.recordHistogram(MetricNames.RAG_QUERY_DURATION, Date.now() - startTime);
    return res.json(ApiResponseBuilder.success(result));
  } catch (error) {
    metrics.increment(MetricNames.RAG_QUERY_ERROR);
    throw error;
  }
}));
```

## Deployment Steps

### Local Development

```bash
# Install dependencies
cd server && npm install
cd ../client && npm install

# Build TypeScript
cd server && npm run build

# Run migrations
npm run migrate

# Start server
npm run dev

# In another terminal, start client
cd client && npm run dev
```

### Docker Deployment

Build Docker image:

```bash
# Server
docker build -f server/Dockerfile -t km-server:latest server/
docker tag km-server:latest gcr.io/YOUR_PROJECT/km-server:latest
docker push gcr.io/YOUR_PROJECT/km-server:latest

# Client
docker build -f client/Dockerfile -t km-client:latest client/
docker tag km-client:latest gcr.io/YOUR_PROJECT/km-client:latest
docker push gcr.io/YOUR_PROJECT/km-client:latest

# Run with docker-compose
docker-compose up -d
```

### Cloud Run Deployment

```bash
# Deploy server to Cloud Run
gcloud run deploy km-server \
  --source server/ \
  --platform managed \
  --region us-central1 \
  --set-env-vars GOOGLE_CLOUD_PROJECT_ID=$PROJECT_ID \
  --memory 2Gi \
  --cpu 2

# Deploy client to Cloud Run (or use Cloud Storage + CDN)
gcloud run deploy km-client \
  --source client/ \
  --platform managed \
  --region us-central1 \
  --memory 512Mi
```

### Kubernetes Deployment

```yaml
# server-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: km-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: km-server
  template:
    metadata:
      labels:
        app: km-server
    spec:
      containers:
      - name: km-server
        image: gcr.io/YOUR_PROJECT/km-server:latest
        env:
        - name: GOOGLE_CLOUD_PROJECT_ID
          value: YOUR_PROJECT
        ports:
        - containerPort: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2"
```

Deploy with:
```bash
kubectl apply -f server-deployment.yaml
```

## Verification

### 1. Health Check

```bash
curl http://localhost:3000/health

# Expected response:
{
  "overall": "HEALTHY",
  "timestamp": 1706752400000,
  "uptime": 3600,
  "services": [
    {"name": "vector-store", "status": "UP", "responseTimeMs": 45},
    {"name": "gemini-api", "status": "UP", "responseTimeMs": 230}
  ],
  "memory": {"heapUsed": 150, "heapTotal": 512, "external": 10}
}
```

### 2. Metrics

```bash
curl http://localhost:3000/metrics

# Expected response with operation counts and latencies
{
  "requests": {"total": 1250, "errors": 3, "duration": {...}},
  "rag": {"total": 450, "errors": 1, "duration": {...}},
  "vectors": {"total": 450, "cacheHits": 340},
  "auth": {"attempts": 120, "successes": 115, "failures": 5, "lockouts": 0}
}
```

### 3. RAG Query

```bash
curl -X POST http://localhost:3000/api/rag/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "What is the security policy?",
    "userId": "user-123",
    "userProfile": {
      "name": "John Doe",
      "department": "Engineering",
      "role": "ENGINEER"
    }
  }'

# Expected response (standard envelope):
{
  "success": true,
  "status": 200,
  "data": {
    "answer": "...",
    "sources": [...],
    "integrity": {...}
  },
  "metadata": {
    "timestamp": 1706752400000,
    "requestId": "req-1706752400000-abc123",
    "path": "/api/rag/query",
    "method": "POST",
    "duration": 2450
  }
}
```

## Monitoring & Observability

### Set Up Logging

Use Google Cloud Logging:

```typescript
import * as logging from '@google-cloud/logging';

const logClient = new logging.Logging({
  projectId: env.GOOGLE_CLOUD_PROJECT_ID
});

const cloudLog = logClient.log('km-application');

// In your logger
cloudLog.write(cloudLog.entry({severity: 'ERROR'}, message));
```

### Set Up Monitoring

Create alerts in Google Cloud Monitoring:

```
- Alert: Error rate > 1%
- Alert: RAG query latency p95 > 30s
- Alert: Cache hit rate < 50%
- Alert: Memory usage > 80%
- Alert: Service health DOWN
```

### Export Metrics

```bash
# Prometheus scrape config
curl http://localhost:3000/metrics/prometheus

# Datadog agent collection
# (Configure Datadog agent to scrape /metrics)
```

## Rollback Procedures

If issues occur after deployment:

```bash
# Docker
docker-compose down
docker-compose up -d  # Previous version

# Cloud Run
gcloud run deploy km-server --image gcr.io/YOUR_PROJECT/km-server:previous-tag

# Kubernetes
kubectl rollout undo deployment/km-server

# Database (if needed)
# Migrations are forward-only; create reverse migrations for rollback
```

## Performance Tuning

### Vector Search Cache

Adjust cache sizes based on memory:
```typescript
// In vector.service.ts
this.searchCache = new VectorSearchCache();
// Default: 500 entries, 10 min TTL
// For high traffic: increase to 1000 entries, 15 min TTL
```

### Retry Configuration

```bash
# Reduce retries for fast failure
RETRY_MAX_ATTEMPTS=3

# Increase for network reliability
RETRY_MAX_ATTEMPTS=7
```

### Timeout Configuration

```bash
# Aggressive (fast feedback)
RAG_QUERY_TIMEOUT=30000

# Conservative (better completeness)
RAG_QUERY_TIMEOUT=90000
```

## Troubleshooting

### Vector Search Failing

```
Check:
1. Vertex AI index created and healthy
2. Service account has permission
3. Vectors properly indexed with metadata filters
4. Network connectivity to GCP
```

### Timeouts Increasing

```
Check:
1. Gemini API rate limits
2. Vector index size (too many vectors)
3. Network latency
4. Cache hit rate (should be >50%)
```

### High Memory Usage

```
Check:
1. Cache sizes (reduce if needed)
2. Log retention (implement log rotation)
3. Memory leaks (check Node.js heap)
4. Concurrent request backlog
```

### Authentication Issues

```
Check:
1. Account lockout status (query database)
2. JWT secret configured correctly
3. Token expiration settings
4. Failed login metrics
```

## Scaling Considerations

### Horizontal Scaling

- Deploy multiple server instances behind load balancer
- Use database connection pooling (PgBouncer)
- Distribute vector search load across Vertex AI endpoints
- Cache invalidation: use Redis for distributed cache

### Vertical Scaling

- Increase Node.js heap size
- Increase cache sizes proportionally
- Adjust request timeouts based on response times

## Next Steps

1. **Testing**: Run integration tests against staging environment
2. **Load Testing**: Use k6 or JMeter to verify performance under load
3. **Security Audit**: Penetration testing and vulnerability scanning
4. **Documentation**: Generate API documentation with OpenAPI/Swagger
5. **Training**: Onboard operations team on monitoring and alerting

## Support & References

- [Vertex AI Vector Search docs](https://cloud.google.com/vertex-ai/docs/vector-search/overview)
- [Google Cloud Logging](https://cloud.google.com/logging/docs)
- [Prometheus metrics format](https://prometheus.io/docs/instrumenting/exposition_formats/)
