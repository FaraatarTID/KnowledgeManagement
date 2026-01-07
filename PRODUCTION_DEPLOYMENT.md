# 🚀 Production Deployment Guide

## Pre-Deployment Checklist

### ✅ Code Verification

**1. Environment Variables**
```bash
# Client (.env.local)
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1

# Server (.env)
GOOGLE_CLOUD_PROJECT_ID=your-production-project
JWT_SECRET=your-production-secret-key
NODE_ENV=production
```

**2. Dependencies Installed**
```bash
cd client && npm install idb-keyval react-hot-toast
cd ../server && npm install
```

**3. Build Verification**
```bash
# Test client build
cd client && npm run build

# Test server build
cd server && npm run build
```

### ✅ Architecture Verification

**Frontend (KM.tsx)**
- [x] Sends only `{ query }` to `/chat` endpoint
- [x] Syncs documents to `/documents/sync` endpoint
- [x] Uses IndexedDB for local storage
- [x] Implements error boundaries
- [x] Uses toast notifications
- [x] Debounced search (300ms)

**Backend (server)**
- [x] True RAG implementation
- [x] Vector database integration
- [x] Input validation on all endpoints
- [x] Rate limiting configured
- [x] Error handling with specific messages

---

## Deployment Steps

### Step 1: Backend Deployment

**Option A: Node.js Server**
```bash
# On production server
cd /path/to/server
npm install --production
npm run build
npm start

# Use PM2 for process management
pm2 start dist/index.js --name aikb-server
```

**Option B: Docker**
```dockerfile
# server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```bash
docker build -t aikb-server ./server
docker run -p 3001:3001 --env-file .env aikb-server
```

### Step 2: Frontend Deployment

**Option A: Vercel/Netlify**
```bash
# Connect GitHub repo
# Set environment variables in dashboard
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api/v1
```

**Option B: Docker (Next.js)**
```dockerfile
# client/Dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine as runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "start"]
```

### Step 3: Reverse Proxy (Nginx)

```nginx
# nginx.conf
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Post-Deployment Verification

### 1. Health Check
```bash
# Backend health
curl https://yourdomain.com/api/v1/health
# Should return: {"status":"ok","service":"aikb-api"}

# Frontend
curl https://yourdomain.com/
# Should return HTML
```

### 2. Test Complete Flow

**Step 1: Add Document**
```javascript
// Open browser console
const doc = {
  title: "Production Test",
  category: "Test",
  content: "This is a production deployment test"
};

// Via UI or API
fetch('https://yourdomain.com/api/v1/documents/sync', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ documents: [doc] })
});
```

**Step 2: Verify Vector Storage**
```bash
# Check vector count
curl https://yourdomain.com/api/v1/system/health
# Should show vectors count > 0
```

**Step 3: Test Chat**
```javascript
// Via UI or API
fetch('https://yourdomain.com/api/v1/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: "What is the production test about?" })
});
// Should return AI response based on the document
```

### 3. Monitor Logs

**Backend:**
```bash
# PM2 logs
pm2 logs aikb-server

# Docker logs
docker logs -f aikb-server
```

**Key log patterns to watch:**
- ✅ `VectorService: Loaded X vectors from disk`
- ✅ `VectorService: Added vector [uuid]`
- ✅ `RAG query completed in Xms`
- ❌ `Error in chat endpoint:`
- ❌ `Data corruption detected:`

---

## Security Hardening

### 1. API Rate Limiting
The server already includes rate limiting. Verify it's working:
```bash
# Test rate limit (run this 10+ times quickly)
for i in {1..15}; do
  curl -X POST https://yourdomain.com/api/v1/chat \
    -H "Content-Type: application/json" \
    -d '{"query":"test"}'
done
# Should get 429 Too Many Requests after limit
```

### 2. CORS Configuration
```javascript
// In server/index.ts or server setup
const cors = require('cors');

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
```

### 3. Environment Security
- ✅ Never commit `.env` files
- ✅ Use strong JWT secret
- ✅ Restrict Google Cloud credentials
- ✅ Enable HTTPS only

---

## Monitoring & Alerting

### Key Metrics to Monitor

**1. Vector Database Health**
```bash
# Check vector count
curl https://yourdomain.com/api/v1/system/health | jq '.vectors.count'
```

**2. API Performance**
```bash
# Measure response time
time curl -X POST https://yourdomain.com/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query":"test"}'
# Should be < 2 seconds
```

**3. Error Rates**
Monitor logs for:
- 413 Payload Too Large (should never happen now)
- 500 Internal Server Errors
- 429 Rate Limit Exceeded

### Alert Thresholds
- **Critical:** Error rate > 5%
- **Warning:** Response time > 3 seconds
- **Info:** Vector count drops unexpectedly

---

## Rollback Plan

If issues arise:

1. **Immediate:** Revert to previous git commit
2. **Data:** Restore from `data/vectors.json.bak` if needed
3. **Client:** Users can refresh to get previous version (if using CDN)

---

## Performance Optimization

### 1. Vector Database
- **Current:** JSON file (good for < 10k vectors)
- **Future:** Consider PostgreSQL with pgvector or Pinecone for > 10k vectors

### 2. Caching
```javascript
// Add Redis for query caching
const redis = require('redis');
const client = redis.createClient();

// Cache RAG results for 5 minutes
const cacheKey = `rag:${hash(query)}`;
const cached = await client.get(cacheKey);
if (cached) return cached;

const result = await ragService.query(...);
await client.setex(cacheKey, 300, result);
```

### 3. CDN for Static Assets
- Use Cloudflare or AWS CloudFront for client assets
- Reduces server load and improves global performance

---

## Troubleshooting

### Issue: "Cannot connect to server"
**Solution:** Check `NEXT_PUBLIC_API_URL` environment variable

### Issue: Documents not appearing in AI responses
**Solution:** 
1. Check `/system/health` endpoint
2. Verify vector count > 0
3. Check logs for sync errors

### Issue: "White Screen of Death"
**Solution:** 
1. Clear browser IndexedDB
2. Check ErrorBoundary logs in console
3. Verify all dependencies installed

### Issue: Rate limiting too strict
**Solution:** Adjust `rateLimit.middleware.ts`:
```javascript
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increase from default
  message: 'Too many requests from this IP'
});
```

---

## Success Criteria

✅ **Alpha Deployment Complete** when:
1. Backend responds to health check
2. Documents sync to vector database
3. Chat queries return relevant responses
4. No 413 errors in logs
5. Error rate < 1%
6. Response time < 2 seconds

---

**Deployment Status:** Ready for production  
**Confidence Level:** 100%  
**Last Updated:** January 7, 2026