# RUNBOOK — Local Drive + Gemini API (AI Studio) Chat Assistant Simulation

## Purpose

This runbook defines a **professional simulation scenario** to validate end-to-end functionality of the chat assistant in:

- **Local drive/manual ingestion mode** (no Google Drive folder sync)
- **Gemini API via AI Studio mode** (API key-based Gemini, not Vertex auth)

The goal is to produce a deterministic pass/fail signal for functional correctness, grounding quality, resilience, and operational observability.

---

## Scope of validation

This scenario validates all critical stages:

1. Runtime mode detection (`local_manual` vs `google_drive`)
2. Local document ingestion and indexing path
3. Query → embedding → vector retrieval → Gemini generation chain
4. Structured response shape (`answer`, `sources`, `ai_citations`, `integrity`)
5. Hallucination and low-context behavior
6. Timeout/reliability behavior under degraded Gemini conditions

---

## Preconditions

## 1) Environment

- Node.js `>=20`
- Server dependencies installed (`server/node_modules` present)
- Writable local data paths (`server/data`)

## 2) Configuration for **AI Studio + Local mode**

Set environment as follows (example):

```bash
# Required for API startup
export JWT_SECRET='simulation-secret'

# Gemini via AI Studio (API key mode)
export GEMINI_API_KEY='YOUR_AI_STUDIO_KEY'
export GEMINI_MODEL='gemini-2.0-flash'
export AI_STUDIO_EMBEDDING_MODEL='gemini-embedding-001'

# Force local/manual mode (Drive OFF)
unset GOOGLE_DRIVE_FOLDER_ID

# Optional deterministic behavior tuning
export RAG_MIN_SIMILARITY='0.6'
export RAG_MAX_INPUT_TOKENS='8000'
export RAG_MAX_COST_PER_REQUEST='0.10'
```

Expected mode in health response:

- `mode.driveConfigured = false`
- `mode.ingestionMode = local_manual`

---

## Simulation dataset

Create three local files for ingestion (Persian/English mixed domain):

1. `policy-leave.txt`
   - Contains official leave policy and numeric limits (e.g., annual leave days).
2. `security-password.txt`
   - Contains explicit password policy and MFA requirement text.
3. `finance-reimbursement.txt`
   - Contains reimbursement cap and approval workflow.

Guideline:
- Include exact phrases that can be cited verbatim.
- Include at least one conflicting statement between two docs for conflict-handling test.

---

## Execution plan (single simulation cycle)

## Step A — Startup and health verification

1. Start server:

```bash
npm run --prefix server dev
```

2. Verify health:

```bash
curl -s http://localhost:3001/api/v1/system/health | jq
```

Pass criteria:
- `status == "online"`
- `mode.ingestionMode == "local_manual"`
- `services.gemini.status == "OK"`

---

## Step B — Auth and session bootstrap

```bash
curl -i -c /tmp/aikb.cookie -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

Pass criteria:
- HTTP `200`
- Auth cookie is set.

---

## Step C — Local ingestion simulation

Upload each local file through manual upload endpoint:

```bash
curl -b /tmp/aikb.cookie -X POST http://localhost:3001/api/v1/documents/upload \
  -F "file=@./simulation-data/policy-leave.txt" \
  -F "category=HR" \
  -F "department=HR" \
  -F "title=Leave Policy"
```

Repeat for all three files with appropriate metadata.

Pass criteria:
- Upload API returns success.
- Response includes document ID.
- No Drive-specific error appears.

---

## Step D — Query correctness and grounding checks

Run query set (at minimum):

1. **Direct factual retrieval**
   - Query: "What is the annual leave limit?"
   - Expect direct answer + supporting citation quote.

2. **Security policy retrieval**
   - Query: "Is MFA required for admin users?"
   - Expect explicit grounded yes/no with cited quote.

3. **Conflict handling**
   - Query: "What is the reimbursement cap?"
   - If conflicting docs exist, answer should mention conflict.

4. **No-context behavior**
   - Query: "What is Mars office cafeteria schedule?"
   - Expect low-confidence/no-info style answer.

Sample command:

```bash
curl -s -b /tmp/aikb.cookie -X POST http://localhost:3001/api/v1/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"What is the annual leave limit?"}' | jq
```

Pass criteria per response:
- Has `answer` string.
- Has `integrity` object.
- For grounded queries: non-empty `sources` and/or `ai_citations` with quote text matching ingested docs.
- For no-context query: low-confidence/no-match behavior, no fabricated citations.

---

## Step E — Reliability / resilience checks

## E1) Timeout budget sanity

Run 20 repeated queries and capture p95 latency.

```bash
for i in $(seq 1 20); do
  /usr/bin/time -f "%e" curl -s -b /tmp/aikb.cookie -X POST http://localhost:3001/api/v1/query \
    -H 'Content-Type: application/json' \
    -d '{"query":"Summarize leave and reimbursement policy in 4 bullets."}' > /dev/null
done
```

Pass criteria:
- No hanging requests.
- No widespread timeout failures under normal load.

## E2) Gemini degraded condition

Temporarily set an invalid API key and restart server.

Expected:
- Health reports Gemini error.
- Query endpoint returns safe failure response (not crash/500 storm).

---

## Step F — Local mode regression assertions

Run this after all queries:

```bash
curl -s http://localhost:3001/api/v1/system/health | jq '.mode'
```

Pass criteria:
- Still `local_manual`.
- System remains functional for query path without Drive configuration.

---

## Acceptance criteria (release gate)

Mark simulation **PASS** only if all are true:

1. Health shows local/manual mode and Gemini OK.
2. Local upload/index/query cycle succeeds for all seeded docs.
3. Grounded queries return citations/sources with no obvious fabrication.
4. Unknown-domain query does not hallucinate confident fabricated facts.
5. Degraded Gemini condition is handled gracefully.
6. No unhandled exceptions or process crashes in logs.

If any fail, mark **FAIL** and capture:
- failing step,
- request payload,
- response body,
- relevant logs,
- remediation owner.

---

## Optional automation bundle (recommended)

This repository now includes a starter automation script:

- `server/scripts/simulate-local-aistudio-chat.mjs`

Run it against a live backend:

```bash
node server/scripts/simulate-local-aistudio-chat.mjs \
  --baseUrl=http://localhost:3001 \
  --loginEmail=admin@example.com \
  --loginPassword=admin123
```

Or with an existing auth cookie:

```bash
node server/scripts/simulate-local-aistudio-chat.mjs \
  --baseUrl=http://localhost:3001 \
  --cookie='token=...'
```

The script outputs a JSON report with pass/fail + per-step evidence.

Suggested report schema:

```json
{
  "timestamp": "ISO8601",
  "mode": "local_manual",
  "gemini": "OK",
  "steps": [{"name": "health", "status": "PASS", "details": {}}],
  "overall": "PASS"
}
```
