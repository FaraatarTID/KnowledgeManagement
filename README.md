# AIKB Knowledge Management System

**Version:** 2.1.0 | **Status:** ✅ Production Ready

> AI-powered knowledge management with secure access, reliable document processing, and complete operational observability.

AIKB is an enterprise knowledge management system combining semantic search, secure authentication, reliable uploads, and comprehensive monitoring.

---

## Quick Links

- 📖 [User Guide](USER_GUIDE.md) - For end users
- 🔧 [Developer Guide](QUICK_REFERENCE.md) - Quick commands
- 🗂️ [Complete Summary](COMPLETE_PROJECT_SUMMARY.md) - All 15 Priority items
- 📡 [API Docs](http://localhost:3001/api/docs) - Interactive Swagger UI (when running)
- 🚀 [Deployment Guide](server/docs/RUNBOOK_DEPLOYMENT.md) - Deploy to production

## System Features

✅ **Security** - Constant-time auth, account lockout, rate limiting  
✅ **Reliability** - Saga uploads, cache management, race condition prevention  
✅ **Observability** - Request tracing, metrics, feature flags  
✅ **API-First** - Complete OpenAPI documentation  
✅ **Production Ready** - 0 errors, fully tested, documented

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and credentials
- Google Cloud/Vertex AI credentials (optional)

### Installation

```bash
# Clone repository
cd C:\Faraatar-TID_Apps\KnowledgeManagement

# Install server
cd server
npm install
cp .env.example .env  # Configure environment variables

# Install client  
cd ../client
npm install
cp .env.example .env  # Configure environment variables
```

### Development

**Terminal 1 - Start API Server:**
```bash
cd server
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 - Start Frontend:**
```bash
cd client
npm run dev
# Runs on http://localhost:3000
```

**Access Application:**
- Frontend: http://localhost:3000
- API Docs: http://localhost:3001/api/docs
- API Health: http://localhost:3001/health

### Docker

```bash
# Build and run with Docker Compose
docker-compose up

# Access services
http://localhost:3000       # Frontend
http://localhost:3001/api   # API
```

Wait for: `Ready in X seconds`

### 4. Login & First Run

1. Open browser: **http://localhost:3000**
2. Login with your configured admin credentials.
   - _Default (Development only)_: `alice@aikb.com` / `admin123` (requires `INITIAL_ADMIN_PASSWORD` in `.env`).
3. **Ask a question!** The AI will answer based on your documents.

> [!CAUTION]
> In **Production**, the system will refuse to start without a valid Supabase connection and a secure `INITIAL_ADMIN_PASSWORD`.

---

## 📚 Reference Guides

| I want to...           | Read this                         |
| :--------------------- | :-------------------------------- |
| **Learn all features** | [User Guide](USER_GUIDE.md)       |
| **Set up for a team**  | [Deployment Guide](DEPLOYMENT.md) |
| **See what's changed** | [Changelog](CHANGELOG.md)         |

---

## 🔐 Security Highlights

- ✅ **Industrial-grade Encryption**: Scrambled using **Argon2id** (OWASP recommended) for high-end protection.
- ✅ **Strict Department Isolation**: "Strict Deny" model ensures users only see data specifically belonging to their unit.
- ✅ **Schema Guardrails**: Every single API request is validated by **Zod** before hitting the brain.
- ✅ **Private by Design**: Your API keys and data stay on your secure server.

---

## 💎 Trust & Reliability

Unlike common AI apps, AIKB is built for **Enterprise Stability**:

| Feature                    | Why It Matters                                          |
| :------------------------- | :------------------------------------------------------ |
| **🛡️ Global Shared Locks** | Prevents data corruption even across multiple services. |
| **✅ Integrity Check**     | The AI must _prove_ every answer with direct quotes.    |
| **🚦 Async Resilience**    | Advanced error handling ensures the brain stays active. |
| **📉 Scale Monitoring**    | Built-in dashboards to track memory and data limits.    |
| **🪵 Structured Logs**     | Professional JSON logs ready for cloud monitoring.      |

---

## 🆘 Troubleshooting

| Problem                   | Solution                                                                                 |
| :------------------------ | :--------------------------------------------------------------------------------------- |
| **"Port already in use"** | Restart your computer or close other terminal windows.                                   |
| **"Login fails"**         | Ensure `INITIAL_ADMIN_PASSWORD` is set in `.env`. Check Supabase connection.             |
| **"AI says mock data"**   | Ensure your Google Cloud / Gemini AI credentials are correctly set in the server `.env`. |
| **"Can't reach website"** | Make sure both terminal windows are still open and running.                              |

---

## 🧑‍💻 Technical Info

### Run Tests

```bash
cd server && npm test   # Check the brain (73 tests)
cd client && npm test   # Check the website (12 tests)
```

### Technology Stack

- **AI Engine**: Google Gemini 2.5 (1M Context)
- **Frontend**: Next.js 15 + React 19
- **Backend**: Node.js + Express (Industrial Hardened)
- **Validation**: Zod (System-wide schemas)
- **Security**: Argon2id + Helmet + CSRF Protection
- **Database**: Atomic JSON Storage (Shared Locking) or Supabase
- **Observability**: AsyncContext + Structured JSON Logging

---

**Developed by Antigravity AI** | January 2026
