# Implementation Cross-Reference (Docs ↔ Code)

**Purpose:** prevent documentation drift and legacy/hallucinated behavior by mapping operational claims directly to implementation.

**Verification scope:** ports, environment variables, API surface, feature implementation, security controls, data paths, and role permissions.

---

## 1) Ports and Base URLs (Verified)

| Component | Runtime Port | Source of Truth | Notes |
|---|---:|---|---|
| Server (Express) | `3001` default | `server/src/config/env.ts` (`PORT` default) and `server/src/index.ts` | Can be overridden by `PORT`. |
| Client (Next.js) | `3000` | `docker-compose.yml` client mapping and runtime env | Dev default is also `3000`. |
| API base path | `/api/v1` | `server/src/index.ts` (`app.use('/api/v1', apiRoutes)`) | All app APIs mount under this prefix. |
| Root health | `/health` | `server/src/index.ts` | Infra health endpoint, outside `/api/v1`. |

---

## 2) Environment Variables (Exact implementation contract)

The server validates environment at startup via Zod. Values below are derived from `server/src/config/env.ts`.

### Required/conditional server vars

- `JWT_SECRET` (required): **hex string**, minimum 64 chars.
- `GOOGLE_DRIVE_FOLDER_ID` (required by schema).
- `GOOGLE_API_KEY` required when `VECTOR_STORE_MODE=LOCAL`.
- `GOOGLE_CLOUD_PROJECT_ID` required when `VECTOR_STORE_MODE=VERTEX`.

### Server vars with defaults

- `NODE_ENV=development|production|test` (default `development`)
- `PORT=3001`
- `VECTOR_STORE_MODE=LOCAL|VERTEX` (default `LOCAL`)
- `GCP_REGION=us-central1`
- `GCP_KEY_FILE=google-key.json`
- `INITIAL_ADMIN_EMAIL=admin@aikb.com`
- `INITIAL_ADMIN_PASSWORD=Admin@123456` (must match complexity checks)
- `INITIAL_ADMIN_NAME=System Administrator`
- `GEMINI_MODEL=gemini-2.5-flash-lite-001`
- `EMBEDDING_MODEL=text-embedding-004`
- `RAG_MIN_SIMILARITY=0.60`
- `RAG_MAX_CONTEXT_CHARS=100000`
- `RAG_MAX_INPUT_TOKENS=8000`
- `RAG_MAX_COST_PER_REQUEST=0.50`
- `RAG_COST_PER_INPUT_K_TOKENS=0.0075`
- `RAG_COST_PER_OUTPUT_K_TOKENS=0.01`
- `ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`

### Optional server vars

- `SUPABASE_URL` (URL or empty)
- `SUPABASE_SERVICE_ROLE_KEY`
- `SENTRY_DSN`

### Client vars

- `NEXT_PUBLIC_API_URL` (client code assumes full API base URL; fallback is `http://localhost:3001/api/v1`).

---

## 3) API Surface: Documented vs Implemented

All paths below are relative to `/api/v1` unless stated otherwise.

### Auth routes (implemented)

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

> Note: `GET /auth/verify` is **not** implemented.

### Chat routes (implemented)

- `POST /query` (modern RAG path)
- `POST /chat` (legacy)
- `POST /chat/legacy` (legacy explicit)

### Document routes (implemented)

- `POST /upload` (admin only)
- `GET /documents`
- `PATCH /documents/:id` (admin only)
- `DELETE /documents/:id` (admin only)
- `POST /documents/:id/sync` (admin only)
- `POST /documents/sync` (authenticated batch sync)
- `POST /sync` (admin global cloud sync)

### User routes (implemented)

- `GET /users` (admin/manager)
- `POST /users` (admin)
- `PATCH /users/:id` (admin)
- `DELETE /users/:id` (admin)
- `PATCH /users/:id/password` (admin)

### System/ops routes (implemented)

- `GET /ping` (public)
- `GET /health` (public lightweight, under `/api/v1`)
- `GET /config` (authenticated)
- `GET /stats` (admin/manager)
- `GET /system/health` (admin)
- `POST /system/cloud-backup` (admin)
- `GET /system/sync-status` (admin)
- `PATCH /config/categories` (admin)
- `PATCH /config/departments` (admin)
- `GET /history` (admin/manager)

### Non-API runtime endpoints

- `GET /` basic service status
- `GET /health` deep health (memory + vector checks)

---

## 4) Role and Permission Model (Route-enforced)

Defined roles: `ADMIN | MANAGER | EDITOR | VIEWER`.

### Effective route authorization

- **ADMIN**: full user management, upload/delete/update docs, global sync, cloud backup, health/admin config.
- **MANAGER**: user list, stats, history read.
- **EDITOR/VIEWER**: authenticated access to allowed non-admin operations (e.g., query/chat/doc list), but no admin management routes.

### Data-level controls

- Token must be cookie-based and valid (`auth.middleware.ts`).
- Token role is cross-checked against current DB role on every authenticated request.
- Department and sensitivity constraints are enforced by `AccessControlEngine` and vector filtering logic.
- Local vector search applies RBAC filters (`department` + `role`) before similarity ranking.

---

## 5) Security Policy Controls (Implemented)

### Request hardening

- `helmet()` enabled globally.
- CORS allow-list from `ALLOWED_ORIGINS` with credentials enabled.
- Recursive sanitization middleware strips null/control/invisible bidi chars and normalizes Unicode.
- Zod validation on request bodies/params/query in route handlers.

### Auth hardening

- Auth from HTTP-only cookie (`token`).
- JWT verification with expiry handling.
- Additional token `iat` checks (future-issued and age window).
- Runtime user status checks (`inactive` blocked).
- Token-vs-DB role mismatch detection returns `401` and logs warning.

### Rate limiting

- Global limiter: `300` requests / 15 minutes.
- Auth limiter (`/auth/login`): `10` attempts / 15 minutes keyed by email/IP.
- Resource limiter utility exists for expensive endpoints.

---

## 6) Data Paths and Persistence (Verified)

Primary server data root is `process.cwd()/data` (in Docker mounted to `./data/server:/home/node/app/data`).

### Current concrete paths used in code

- Uploads: `data/uploads/`.
- SQLite metadata / local vector metadata DB: `data/vectors.db`.
- Local metadata overrides: `data/metadata_overrides.json`.
- Sync status state: `data/sync_status.json`.
- System config state: `data/system_config.json`.
- Backup service source DB: `data/vectors.db`.

### Supabase behavior

- If Supabase URL/key absent, system logs warning and continues in local-storage mode for components that support fallback.

---

## 7) Feature Implementation Status (Code-backed)

Verified as implemented in codebase:

- Constant-time/auth-hardening patterns around auth flow.
- RBAC at route level and vector retrieval filtering.
- Saga-based upload transaction with compensation.
- Cache invalidation hooks tied to document/vector lifecycle.
- OpenAPI generator utility exists and mounts `/api/openapi.json` + docs path via helper.
- Metrics, tracing/context, and structured logger utilities present.

Potentially misleading legacy content to avoid in docs:

- `GET /auth/verify` endpoint claim.
- Assuming document upload is `POST /documents` (actual upload route is `POST /upload`).
- Assuming feature-flag admin routes are mounted in API (route file exists, but is not mounted in `api.routes.ts`).

---

## 8) Documentation Integrity Checklist (for future updates)

Before publishing docs changes, verify:

1. **Ports:** `docker-compose.yml`, `server/src/config/env.ts`, `server/src/index.ts`.
2. **Env vars:** `server/src/config/env.ts` only (treat as single source of truth).
3. **Endpoints:** `server/src/routes/*.ts` + `server/src/routes/api.routes.ts` mounts.
4. **Roles:** route `requireRole(...)` usage + `auth.middleware.ts` role validation.
5. **Data paths:** `server/src/services/**` and `server/src/middleware/upload.middleware.ts`.
6. **Security controls:** `index.ts` middleware stack + auth/rate-limit/sanitization modules.

If an endpoint/setting is not in these sources, do not document it as active.
