# AIKB Knowledge Management System

**Version:** 2.1.0 | **Status:** ✅ Production Ready

> AI-powered knowledge management with secure access, reliable document processing, and complete operational observability.

---

## 📚 Documentation Hub

### 🏗️ For Administrators

- **[⚡ Quick Start (5 Mins)](docs/admin/quick-start.md)** - Get running instantly with a Gemini API Key.
- **[⚙️ Full Setup Guide](docs/admin/full-setup.md)** - Detailed Drive & AI configuration.
- **[🌐 Deployment Guide](docs/admin/deployment-advanced.md)** - Production infrastructure (Docker, Nginx, SSL).

### 📘 For Users

- **[📖 User Manual](docs/user/user-manual.md)** - How to use Chat, Documents, and Search.

### 🛠️ For Developers & IT

- **[🔍 Technical Reference](docs/technical/reference.md)** - API specs, CLI commands, and Environmental variables.
- **[🧾 Implementation Cross-Reference](docs/technical/implementation-cross-reference.md)** - Verified docs-to-code mapping for ports, env vars, API routes, RBAC, security, and data paths.
- **[🚨 Troubleshooting Runbooks](docs/technical/runbooks/RUNBOOK_DEPLOYMENT.md)** - Solutions for common deployment and runtime issues.
- **[🏛️ Architecture Overview](docs/architecture/overview.md)** - System boundaries and Architectural Decision Records (ADRs).

---

## 🚀 Key Features

- ✅ **Hybrid Vector Engine** - Seamlessly switch between Local SQLite (AI Studio) and Enterprise Vertex AI.
- ✅ **Zero-Trust Security** - Constant-time auth, strict RBAC, and department-level isolation.
- ✅ **Saga-Based Reliability** - Distributed transactions for robust document synchronization.
- ✅ **Operational Observability** - Distributed tracing, structured logging, and performance metrics.
- ✅ **Precision RAG** - Mandatory confidence levels and automated hallucination detection.

---

## 🛠️ System Requirements

- **Node.js**: v18 or newer.
- **AI Backend**: Google Gemini API Key (Easy Mode) OR Google Cloud Project (Enterprise).
- **Storage**: Local SQLite (Default) OR Supabase (for distributed deployments).

---

## 🏁 Getting Started

### 1. Installation

```bash
# Clone repository
cd C:\Faraatar-TID_Apps\KnowledgeManagement

# Setup Server
cd server
npm install
cp .env.example .env

# Setup Client
cd ../client
npm install
cp .env.example .env
```

### 2. Configuration (Minimum for Easy Mode)

In `server/.env`:

```env
GOOGLE_API_KEY=your_key_here
VECTOR_STORE_MODE=LOCAL
INITIAL_ADMIN_PASSWORD=Admin@123456  # Must be 10+ chars, Upper/Lower/Num/Special
```

### 3. Launch Development

**Terminal 1 (Backend):**

```bash
cd server && npm run dev
```

**Terminal 2 (Frontend):**

```bash
cd client && npm run dev
```

### 3.1 Common startup issue (Windows): `ERR_MODULE_NOT_FOUND` for `express`

If backend startup fails with `Cannot find package .../server/node_modules/express/index.js`, dependencies were not installed (or install was partial).

```bash
cd server
npm install
npm run dev
```

If login shows **HTTP 500** with proxy `ECONNREFUSED`, this indicates the backend is not reachable on port `3001`.

Quick verification:
```bash
# In a separate terminal while backend is running
curl http://localhost:3001/api/v1/system/health
```
Expected response includes `{"status":"healthy"`.

### 4. Login

- **URL**: [http://localhost:3000](http://localhost:3000)
- **Default User**: `admin@aikb.com`
- **Default Password**: (The one you set in `.env`)

---

## 🔐 Security Highlights

- ✅ **Industrial-grade Encryption**: Scrambled using **Argon2id** (OWASP recommended).
- ✅ **Strict Department Isolation**: "Strict Deny" model ensures users only see data belonging to their unit.
- ✅ **Schema Guardrails**: Every API request is validated by **Zod** before processing.

---

## 🧑‍💻 Technical Info

### Run Tests

```bash
cd server && npm test   # Backend suite (31+ Integration, 40+ Unit)
cd client && npm test   # Frontend components
```

### Technology Stack

- **AI Engine**: Google Gemini 1.5/2.0
- **Frontend**: Next.js 15 + React 19 + TailwindCSS
- **Backend**: Node.js + Express + SQLite/Supabase
- **Observability**: OpenTelemetry + Sentry (Optional)

---

**Developed by Antigravity AI** | February 2026
