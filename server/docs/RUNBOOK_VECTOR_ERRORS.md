# Vector Search Failures Runbook

## Symptom: "FATAL: Vertex AI Service unavailable" error

**Root Cause:** Google Cloud credentials missing, GOOGLE_CLOUD_PROJECT_ID not set, or Vertex AI API quota exceeded

**Impact:** Document vectorization fails, vector search returns no results, fail-loud detection triggers

**Resolution:**

### Step 1: Verify Google Cloud configuration
```bash
# Check if project ID is set
echo $GOOGLE_CLOUD_PROJECT_ID

# Expected output: projects/my-project-12345
# If empty, configure:
export GOOGLE_CLOUD_PROJECT_ID=projects/my-project-id
```

### Step 2: Verify credentials file exists
```bash
ls -la /path/to/credentials/key.json

# Expected: File exists and readable by application user
# Location should be in server/key.json

# Check file is valid JSON
jq '.' /path/to/credentials/key.json > /dev/null
echo "Credentials valid: $?"  # 0 = valid
```

### Step 3: Test Vertex AI API connectivity
```bash
# Try a simple embedding request
curl -X POST \
  'https://us-central1-aiplatform.googleapis.com/v1/projects/MY_PROJECT_ID/locations/us-central1/publishers/google/models/textembedding-gecko@002:predict' \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [
      {
        "content": "Hello, world!"
      }
    ]
  }'
```

**Expected Response:** Embedding vector (not error)

### Step 4: Check API quota
```bash
# Visit Google Cloud Console
# Navigate to APIs & Services > Quotas
# Search for "Vertex AI API"
# Check if usage is at 100% of quota

# Or use gcloud:
gcloud compute projects describe MY_PROJECT_ID
```

**If quota exceeded:**
```bash
# Request quota increase in Google Cloud Console
# Temporary mitigation: Use feature flag to disable vectorization
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_1_vector_validation \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 0}'
```

### Step 5: Verify service is deployed
```bash
# Check Vertex AI models are available
gcloud ai models list \
  --project=${GOOGLE_CLOUD_PROJECT_ID} \
  --region=us-central1 \
  | grep -i "textembedding-gecko"
```

### Step 6: Check application logs for details
```bash
# View server logs
tail -100 /var/log/aikb/server.log | grep -i "vertex\|embedding\|fatal"

# Expected: Should see connection attempt details
```

### Step 7: Restart service after fixing configuration
```bash
# Update .env file
vi .env
# Add: GOOGLE_CLOUD_PROJECT_ID=projects/my-project-id

# Restart service
systemctl restart aikb-server

# Verify service is running
curl http://localhost:3000/api/health
```

---

## Symptom: Searches returning 0 results for all queries

**Root Cause:** RBAC filters too restrictive (all results filtered out)

**Impact:** Users see "no results" even when documents exist

**Resolution:**

### Step 1: Verify department filter configuration
```bash
curl http://localhost:3000/api/admin/rbac/config
```

**Expected Response:**
```json
{
  "filteringEnabled": true,
  "departmentFilter": {
    "enabled": true,
    "departmentField": "department"
  },
  "roleFilter": {
    "enabled": true,
    "minimumRole": "user"
  }
}
```

### Step 2: Check user's permissions
```bash
USER_ID="user-123"

curl http://localhost:3000/api/admin/rbac/user?userId=${USER_ID}
```

**Expected Response:**
```json
{
  "userId": "user-123",
  "role": "user",
  "departments": ["Engineering", "Product"],
  "accessLevel": "standard"
}
```

### Step 3: If user has no departments, add permission
```bash
USER_ID="user-123"

curl -X POST http://localhost:3000/api/admin/rbac/permissions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "'"${USER_ID}"'",
    "department": "Engineering",
    "role": "user"
  }'
```

### Step 4: Verify documents have department tags
```bash
# Query database for documents and their departments
SELECT id, title, department, created_at
FROM documents
WHERE department IS NOT NULL
LIMIT 10;

# Expected: Documents have department values
```

### Step 5: Test search with relaxed filters
```bash
# Temporarily disable RBAC filtering
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_2_rbac_api_filtering \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 0}'

# Try search again
curl 'http://localhost:3000/api/documents/search?q=test' \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# If results appear, RBAC filtering is the issue
# Re-enable filtering
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_2_rbac_api_filtering \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 100}'
```

### Step 6: Fix permissions and re-test
```bash
# Grant user access to more departments
curl -X POST http://localhost:3000/api/admin/rbac/bulk-grant-access \
  -H "Content-Type: application/json" \
  -d '{
    "userIds": ["user-123"],
    "departments": ["Engineering", "Product", "Sales"]
  }'

# Try search again
curl 'http://localhost:3000/api/documents/search?q=test' \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

---

## Symptom: Vector search latency > 1 second

**Root Cause:** Vertex AI service slow, network latency, or too many results

**Impact:** Slow user experience, timeouts, poor usability

**Resolution:**

### Step 1: Check Vertex AI service health
```bash
# Monitor Vertex AI API performance
curl http://localhost:3000/api/health/vector-db
```

**Expected Response:**
```json
{
  "status": "healthy",
  "responseTime": 250,
  "lastCheck": "2026-02-01T12:34:56Z",
  "quota": {
    "used": 50,
    "limit": 100,
    "utilizationPercent": 50
  }
}
```

### Step 2: Check search parameters
```bash
# Reduce topK (number of results) if too high
curl -X POST http://localhost:3000/api/chat/query \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "test query",
    "context": {
      "topK": 5
    }
  }'

# Expected: Faster response with fewer results
```

### Step 3: Monitor network latency
```bash
# Check network to Vertex AI
ping -c 4 aiplatform.googleapis.com
# Expected: latency < 50ms

# Check DNS resolution
nslookup aiplatform.googleapis.com
# Expected: Should resolve immediately
```

### Step 4: Check Vertex AI quota usage
```bash
gcloud compute projects describe ${GOOGLE_CLOUD_PROJECT_ID} \
  --format='value(quotaUsageMetrics[0].usage)'
```

### Step 5: Optimize search query
```bash
# If searching large document set, add department filter
curl -X POST http://localhost:3000/api/chat/query \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "test query",
    "context": {
      "department": "Engineering",
      "topK": 5
    }
  }'

# Expected: Faster response with pre-filtered results
```

---

## Monitoring & Prevention

### Key Metrics
```influxql
# Vector search success rate (target > 95%)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "vector_search")
  |> filter(fn: (r) => r.success == "true")
  |> window(every: 5m)
  |> count()

# Vector search latency (target < 500ms p99)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "vector_search_latency")
  |> window(every: 5m)
  |> quantile(q: 0.99)

# RBAC filter rejections (monitor for issues)
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "rbac_filter_rejections")
  |> window(every: 1h)
  |> count()
```

### Alerting Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| Vector search success rate < 95% | WARNING | Check Vertex AI health |
| Vector search latency p99 > 1000ms | WARNING | Check network/quota |
| FATAL errors > 1/minute | CRITICAL | Disable vectorization, investigate |
| Quota usage > 80% | WARNING | Request quota increase |

### Dashboard
- **"AIKB Vector Search"** - Success rate, latency, error distribution
- **"AIKB Vertex AI"** - API response time, quota usage, failures
- **"AIKB RBAC Filtering"** - Filter rejections, department distribution

---

## Configuration & Optimization

### Vector Search Parameters
```json
{
  "topK": 5,
  "embeddingModel": "textembedding-gecko@002",
  "similarityThreshold": 0.5,
  "departmentFilter": true,
  "rbacFilter": true
}
```

### Feature Flags
- `priority_1_1_vector_validation` - Enable/disable fail-loud validation
- `priority_2_2_rbac_api_filtering` - Enable/disable RBAC filtering

---

## Rollback Procedure

If vector search causing cascading failures:

```bash
# 1. Disable vector search temporarily
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_1_vector_validation \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 2. Monitor error rates
curl http://localhost:3000/api/health

# 3. Check Vertex AI service status
# 4. Once resolved, re-enable
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_1_1_vector_validation \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

## See Also
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
- RUNBOOK_TRACING.md - Request tracing guide
