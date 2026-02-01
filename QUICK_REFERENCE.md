# AIKB Quick Reference Guide

**Version:** 2.1.0 | **Last Updated:** February 1, 2026 | **Status:** ✅ Production Ready

---

## 🚀 Quick Start (5 Minutes)

### Installation & Setup

```bash
# Clone and navigate
cd C:\Faraatar-TID_Apps\KnowledgeManagement
cd server && npm install
cd ../client && npm install

# Configure
cp server/.env.example server/.env      # Edit with credentials
cp client/.env.example client/.env.local # Edit with API URLs
```

### Run Development

```bash
# Terminal 1: API Server (Port 3001)
cd server && npm run dev

# Terminal 2: Frontend (Port 3000)
cd client && npm run dev

# Access: http://localhost:3000
```

---

## 📋 Common Commands

### Development

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm test` | Run all tests |
| `npm test -- --watch` | Tests in watch mode |
| `npm run lint` | Check code quality |
| `npm run lint:fix` | Auto-fix linting issues |

### Docker

```bash
docker-compose up              # Start all services
docker-compose down            # Stop services
docker-compose logs -f         # View logs
docker-compose up --build      # Rebuild images
```

### Verification

```bash
npx tsc --noEmit              # Check TypeScript (should be 0 errors)
npm test                      # Run all tests (70+ should pass)
curl http://localhost:3001/health  # API health check
```

---

## 🔧 Development Tasks

### Testing

```bash
npm test                                  # All tests
npm test -- auth.test.ts                 # Single file
npm test -- --coverage                   # Coverage report
npm test -- --watch                      # Watch mode
npm test -- priority-fixes.integration    # Integration tests
```

### Type Checking

```bash
npx tsc --noEmit                         # Full check
npx tsc --noEmit --watch                 # Watch mode
npx tsc --noEmit server/src/utils/*      # Specific folder
```

### Code Quality

```bash
npm run lint                             # Show issues
npm run lint:fix                         # Auto-fix
npm run format                           # Format code
```

---

## 📡 API Endpoints

### Base URL
```
http://localhost:3001/api/v1
```

### Documentation
```
http://localhost:3001/api/docs    (Swagger UI)
http://localhost:3001/api/openapi.json
```

### Key Endpoints

**Auth:**
```bash
POST   /auth/login              # Login
POST   /auth/logout             # Logout
GET    /auth/verify             # Verify token
```

**Documents:**
```bash
GET    /documents               # List
POST   /documents               # Upload
DELETE /documents/{id}          # Delete
```

**Chat:**
```bash
POST   /chat                    # Send message
GET    /chat/{chatId}           # Get history
```

**System:**
```bash
GET    /health                  # Health check
GET    /system/metrics          # Metrics
GET    /system/status           # Status
```

### Example Requests

```bash
# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# List documents (with auth)
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/documents

# Upload document
curl -X POST http://localhost:3001/api/v1/documents \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@document.pdf"
```

---

## ⚙️ Configuration

### Server (.env)

**Required:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-key
SUPABASE_ANON_KEY=your-key
VERTEX_AI_PROJECT_ID=your-project
VERTEX_AI_LOCATION=us-central1
```

**Optional:**
```env
PORT=3001
NODE_ENV=development
INFLUXDB_URL=http://localhost:8086
TRACING_ENABLED=true
RAG_MIN_SIMILARITY=0.60
```

### Client (.env.local)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
```

---

## 🚀 Deployment

### Pre-Deployment

```bash
# 1. Verify compilation
npx tsc --noEmit                    # Should show: No errors

# 2. Run all tests
npm test                            # Should show: All pass

# 3. Build project
npm run build                       # Should complete successfully

# 4. Final check
npx tsc --noEmit
```

### Staging

```bash
git push staging main
# Verify at: https://staging-api.aikb.example.com/health
```

### Production Canary (10%)

```bash
curl -X POST https://api.aikb.example.com/api/v1/features/new_feature \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true, "rolloutPercentage": 10}'

# Monitor for 1 hour:
# - Check error rates (should be <1%)
# - Check response times
# - Check trace logs
```

### Production Full (100%)

```bash
curl -X POST https://api.aikb.example.com/api/v1/features/new_feature \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"enabled": true, "rolloutPercentage": 100}'
```

---

## 🐛 Troubleshooting

### Port Already in Use

```bash
netstat -ano | findstr :3000
taskkill /PID <PID> /F
# Or use: PORT=3002 npm run dev
```

### Connection Issues

```bash
# Check API is running
curl http://localhost:3001/health

# Check credentials
cat server/.env | grep SUPABASE

# Check network
ipconfig | findstr IPv4
```

### Build Errors

```bash
# Clean reinstall
rm -rf node_modules package-lock.json
npm install
npx tsc --noEmit
```

### Test Failures

```bash
npm test -- --grep "test name"        # Single test
npm test -- --coverage                # Check coverage
node --inspect-brk node_modules/.bin/vitest  # Debug
```

---

## 📚 Feature Highlights

### Priority 3 Components (All ✅)

| Feature | Status | File |
|---------|--------|------|
| Feature Flags | ✅ Complete | `feature-flags.ts` |
| Request Tracing | ✅ Complete | `otel-setup.ts` |
| Metrics Persistence | ✅ Complete | `metrics.ts` |
| OpenAPI Spec | ✅ Complete | `openapi-generator.ts` |
| Operational Runbooks | ✅ Complete | 7 markdown files |

### Priority 1-2 Fixes (All ✅)

- ✅ Vector Validation
- ✅ Hallucination Detection
- ✅ Auth Constant-Time
- ✅ Connection Pool
- ✅ Rate Limiter (Email)
- ✅ Saga Pattern
- ✅ RBAC Filtering
- ✅ Error Request ID
- ✅ Cache Invalidation
- ✅ Integration Tests

---

## 📖 Resources

| Document | Purpose |
|----------|---------|
| [README.md](README.md) | Setup & overview |
| [USER_GUIDE.md](USER_GUIDE.md) | Complete user guide |
| [COMPLETE_PROJECT_SUMMARY.md](COMPLETE_PROJECT_SUMMARY.md) | All 15 items |
| [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md) | Deployment steps |

### Runbooks (server/docs/)

- [RUNBOOK_AUTH_TIMING.md](server/docs/RUNBOOK_AUTH_TIMING.md) - Auth issues
- [RUNBOOK_CACHE_STALE.md](server/docs/RUNBOOK_CACHE_STALE.md) - Cache problems
- [RUNBOOK_DEPLOYMENT.md](server/docs/RUNBOOK_DEPLOYMENT.md) - Deployment issues
- [RUNBOOK_RATE_LIMIT.md](server/docs/RUNBOOK_RATE_LIMIT.md) - Rate limiting
- [RUNBOOK_SAGA_FAILURES.md](server/docs/RUNBOOK_SAGA_FAILURES.md) - Transactions
- [RUNBOOK_TRACING.md](server/docs/RUNBOOK_TRACING.md) - Debugging
- [RUNBOOK_VECTOR_ERRORS.md](server/docs/RUNBOOK_VECTOR_ERRORS.md) - Vector search

---

## ✅ Project Status

**Compilation:** 0 TypeScript errors  
**Tests:** 70+ passing  
**Production Ready:** ✅ YES  
**Last Updated:** February 1, 2026  

---  

