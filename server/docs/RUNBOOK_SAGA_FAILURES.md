# Saga Compensation Failures Runbook

## Symptom: Document in Vertex AI but not in Google Drive

**Root Cause:** Upload succeeded (document vectorized), but saga compensation failed to delete file from Drive

**Impact:** Storage quota used, orphaned files in Drive, data inconsistency

**Resolution:**

### Step 1: Identify orphaned documents
```sql
SELECT id, title, embedding_id, drive_file_id, created_at
FROM documents
WHERE embedding_id IS NOT NULL
  AND drive_file_id IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Step 2: Check saga transaction log
```sql
SELECT id, status, created_at, error_message, step_count
FROM saga_transactions
WHERE document_id IN (SELECT id FROM documents WHERE drive_file_id IS NULL AND embedding_id IS NOT NULL)
ORDER BY created_at DESC
LIMIT 20;
```

**Expected to find:** Transactions with status = 'compensation_failed'

### Step 3: Manually delete orphaned file from Drive
```bash
# Get fileId from database
DRIVE_FILE_ID=$(psql -c "SELECT drive_file_id FROM documents WHERE id='doc-123'" -t)

# Delete from Drive using Google API
curl -X DELETE \
  https://www.googleapis.com/drive/v3/files/${DRIVE_FILE_ID}?supportsAllDrives=true \
  -H "Authorization: Bearer ${GOOGLE_API_TOKEN}"
```

### Step 4: Update metadata to clean up
```sql
UPDATE documents
SET drive_file_id = NULL,
    upload_status = 'vectorized_only',
    updated_at = NOW()
WHERE id = 'doc-123';

DELETE FROM saga_transactions
WHERE document_id = 'doc-123'
  AND status = 'compensation_failed';
```

### Step 5: Notify user
```bash
# Send notification about upload completion
curl -X POST http://localhost:3000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-456",
    "type": "document_uploaded",
    "message": "Document uploaded and indexed. Note: Drive backup is optional.",
    "documentId": "doc-123"
  }'
```

---

## Symptom: Upload fails but file remains in Drive

**Root Cause:** Saga compensation never ran (process crashed mid-rollback)

**Impact:** Uploaded file not indexed, not in database, but storage used

**Resolution:**

### Step 1: Find stuck saga transactions
```sql
SELECT id, status, created_at, last_updated_at, document_id
FROM saga_transactions
WHERE status IN ('compensation_failed', 'pending')
  AND last_updated_at < NOW() - INTERVAL '10 minutes'
ORDER BY created_at DESC
LIMIT 20;
```

### Step 2: Check Drive for orphaned files
```bash
# Search Drive for untracked files (no document_id in metadata)
curl -s \
  'https://www.googleapis.com/drive/v3/files?q=properties%20has%20{key=%27tracked%27%20and%20value=%27false%27}'
  -H "Authorization: Bearer ${GOOGLE_API_TOKEN}" \
  | jq '.files[] | {id, name, size, createdTime}'
```

### Step 3: Manually delete from Drive
```bash
# For each orphaned file
for FILE_ID in file1 file2 file3; do
  curl -X DELETE \
    https://www.googleapis.com/drive/v3/files/${FILE_ID}?supportsAllDrives=true \
    -H "Authorization: Bearer ${GOOGLE_API_TOKEN}"
  echo "Deleted: ${FILE_ID}"
done
```

### Step 4: Clean up saga transactions
```sql
DELETE FROM saga_transactions
WHERE status = 'compensation_failed'
  AND last_updated_at < NOW() - INTERVAL '1 hour';
```

### Step 5: Verify cleanup
```bash
# Verify Drive space reclaimed (may take 24-48 hours for quota update)
curl -s \
  'https://www.googleapis.com/drive/v3/about?fields=storageQuota' \
  -H "Authorization: Bearer ${GOOGLE_API_TOKEN}" \
  | jq '.storageQuota'
```

---

## Symptom: Document partially uploaded (vector index lost)

**Root Cause:** Saga rolled back after vectorization but before Drive backup

**Impact:** Document not searchable, not in Vertex AI

**Resolution:**

### Step 1: Check document status
```sql
SELECT id, title, embedding_id, drive_file_id, status
FROM documents
WHERE id = 'doc-789';
```

### Step 2: If embedding_id is null, re-vectorize
```bash
# Trigger re-vectorization
curl -X POST http://localhost:3000/api/documents/789/re-vectorize \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

### Step 3: Monitor re-vectorization
```bash
# Check status
curl http://localhost:3000/api/documents/789/status \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

**Expected Response:**
```json
{
  "id": "doc-789",
  "status": "vectorizing",
  "progress": 45,
  "createdAt": "2026-02-01T12:00:00Z"
}
```

### Step 4: If stuck, check vector service
```bash
# Verify Vertex AI is healthy
curl http://localhost:3000/api/health/vector-db \
  -H "Authorization: Bearer ${JWT_TOKEN}"
```

---

## Monitoring & Prevention

### Key Metrics
```influxql
# Saga compensation trigger rate
from(bucket:"aikb")
  |> filter(fn: (r) => r._measurement == "saga_compensation_triggers")
  |> window(every: 5m)
  |> sum()

# Expected: < 1% of uploads should trigger compensation
```

### Alerting Rules

**WARNING:** Compensation failures > 5 in 1 hour
```bash
# Check current status
curl http://localhost:3000/api/admin/metrics/saga-compensation
```

**CRITICAL:** Compensation failures > 10 in 1 hour
```bash
# Disable saga pattern temporarily
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_1_saga_pattern \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

### Dashboard
- **"AIKB Saga Compensation"** - Shows triggers, successes, failures
- **"AIKB Upload Status"** - Shows upload flow success rates

---

## Prevention Checklist

- [ ] Monitor saga_compensation_triggers metric hourly
- [ ] Set up Slack alerts for compensation failures
- [ ] Test compensation path weekly (feature flag toggle test)
- [ ] Monitor Drive API quota
- [ ] Verify Vertex AI availability
- [ ] Check database connection pool health

---

## Rollback Procedure

If saga pattern causing cascading failures:

```bash
# 1. Disable saga pattern (use simple transaction)
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_1_saga_pattern \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 2. Monitor error rates
curl http://localhost:3000/api/health

# 3. Clean up stuck transactions
curl -X POST http://localhost:3000/api/admin/saga/cleanup-stuck

# 4. Resume once cleared
curl -X POST http://localhost:3000/api/admin/feature-flags/priority_2_1_saga_pattern \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

## See Also
- RUNBOOK_DEPLOYMENT.md - Deployment troubleshooting
- RUNBOOK_TRACING.md - Request tracing guide
