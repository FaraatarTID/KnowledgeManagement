# 🌍 Production Deployment Guide: AIKB on the Web

This guide explains how to take the AIKB app from your computer and put it on the internet so your whole company can use it securely.

### 🔑 Admin Bootstrapping

On the first run with a fresh database, the system creates the initial Admin user. You **must** provide these credentials in your `.env`.

- **Email**: `INITIAL_ADMIN_EMAIL` (e.g., `alice@aikb.com`)
- **Password**: `INITIAL_ADMIN_PASSWORD` (e.g., `admin123` - **REQUIRED FOR BOOTSTRAP**)

You can customize this in your `.env`:

```env
INITIAL_ADMIN_EMAIL=your-real-email@domain.com
INITIAL_ADMIN_PASSWORD=your-secure-password
INITIAL_ADMIN_NAME=System Administrator
```

> [!IMPORTANT]
> Change the password in the "Access Control" tab immediately after your first login.

---

### 🌐 Google Cloud Integration (RAG Data)

The system uses a **Service Account** to index your documents.

1. Place your Google Cloud Service Account JSON key in `/server/data/google-key.json`.
2. Add the path to `.env`: `GOOGLE_AUTH_KEY_PATH=./data/google-key.json`.
3. Share your Google Drive folders with the `client_email` found inside that JSON file.

> [!NOTE]
> Application Login is NOT Google OAuth. It is an internal Email/Password system. The "Google Account" refers solely to the Data Access layer.

---

## 🛠️ Step 1: Prepare the Server

We recommend **Ubuntu 22.04 LTS** (DigitalOcean, AWS, Google Cloud).

Run these commands to install dependencies:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install docker.io docker-compose -y
sudo systemctl enable --now docker

# Install Nginx
sudo apt install nginx -y
```

---

## 📦 Step 2: Upload Files

Copy the following folders/files to your server (e.g., to `/home/user/aikb`):

- `server/`
- `client/`
- `docker-compose.yml`
- `nginx.conf.example`

_(Do NOT copy `node_modules`)_

---

## 🚀 Step 3: Configure & Launch

### 1. Create Production Secrets

Create a `.env` file in the `server` folder:

```ini
NODE_ENV=production
PORT=3001

# CRITICAL: Must be at least 32 characters for production safety.
JWT_SECRET=production_secret_key_change_me_immediately_to_something_secure_random_string

# Google Cloud
GOOGLE_CLOUD_PROJECT_ID=...
GCP_REGION=us-central1
GCP_KEY_FILE=gcp-key.json
GOOGLE_DRIVE_FOLDER_ID=...

# Database (Supabase) - REQUIRED for production users
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI Config
GEMINI_MODEL=gemini-2.5-flash-lite-001
EMBEDDING_MODEL=text-embedding-004

# Security
ALLOWED_ORIGINS=https://your-app.com,https://admin-portal.com

# Observability (Optional)
SENTRY_DSN=your-sentry-dsn
```

> [!TIP]
> The server uses **Zod Validation**. If any of the above variables are missing or incorrectly formatted (e.g. invalid URL), the app will provide a detailed checklist of errors and refuse to start. This prevents "Ghost Failures".

---

## 🪵 Industrial Monitoring

In production (`NODE_ENV=production`), the system outputs **Structured JSON Logs**. These are designed for high-end observability tools like Datadog, Grafana Loki, or Splunk.

### Error Tracking (Optional)

If you use Sentry, set `SENTRY_DSN` in the server `.env` (and `NEXT_PUBLIC_SENTRY_DSN` in the client `.env`) to capture unhandled exceptions with request IDs for faster incident triage.

### Key Telemetry to Watch:

- **System Hardening Errors**: `grep '"level":"ERROR"'`
- **Unauthorized Access**: `grep '"granted":false'`
- **Transaction Failures**: `grep 'SYNC_FAILED'`

### Zod Runtime Verification:

The server validates its entire `.env` environment at startup using **Zod**. If a critical secret like `JWT_SECRET` is too short or `SUPABASE_URL` is malformed, the app will **fail fast** with a detailed error report, preventing insecure state.

---

### 2. Initialize Database (Supabase)

Run this SQL to establish the hardened schema:

```sql
-- 1. Users (Hardened Isolation)
create table users (
  id uuid default gen_random_uuid() primary key,
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  name varchar(255) not null,
  role varchar(50) default 'VIEWER',
  department varchar(100) default 'General', -- Critical for isolation
  status varchar(50) default 'Active',
  created_at timestamp default now(),
  updated_at timestamp default now()
);
```

### 3. Verify Code Integrity (Optional but Recommended)

Before building, you can run the test suite on the server to ensure environment is okay:

```bash
cd server
npm install
npm test
```

_Note: Backend tests require either a valid Supabase connection or for the server to be in a controlled test environment. Insecure legacy "Demo Codes" have been completely removed._

### 4. Start the App

```bash
sudo docker-compose up -d --build
```

---

## 🌐 Step 4: Domain & SSL

1.  **Configure Nginx**:

    ```bash
    sudo cp nginx.conf.example /etc/nginx/sites-available/aikb
    sudo ln -s /etc/nginx/sites-available/aikb /etc/nginx/sites-enabled/
    sudo systemctl restart nginx
    ```

2.  **Get Free SSL (HTTPS)**:
    ```bash
    sudo apt install certbot python3-certbot-nginx -y
    sudo certbot --nginx -d your-domain.com
    ```

---

## 🚨 Troubleshooting

- **"502 Bad Gateway"**: Docker container crashed? Check logs: `sudo docker logs aikb-server`.
- **"App exits immediately"**: Verify `JWT_SECRET` is set in `.env`.

## 📊 Production Monitoring

### Key Metrics (Accessible via `/health`)

The `/health` endpoint is **Deep**. It monitors:

- **Persistence Visibility**: Verifies write access to the shared lock registry.
- **Memory RSS**: Tracks usage to prevent OOM during massive indexing.
- **Vector Count**: Real-time status of the local semantic index.

### Scale Strategy

The JSON Vector Store is designed for **Speed and Simplicity**. For extreme scale (>10,000 documents), we recommend moving the file storage to a high-speed SSD and monitoring the `resources.memory.heapUsed` metric in the health check.

---

### Rollback Procedure

If data corruption is detected:

1. **Stop services**: `sudo docker-compose down`
2. **Restore vector store**: `cp data/vectors.json.bak data/vectors.json`
3. **Clear client caches**: Instruct users to clear browser cache
4. **Restart**: `sudo docker-compose up -d`
5. **Monitor**: Check logs for 30 minutes

### Performance Tuning

If sync is slow, adjust concurrency in `server/src/services/sync.service.ts`:

```typescript
const CONCURRENCY = 3; // Reduce to 2 if hitting rate limits
const BATCH_SIZE = 5; // Reduce to 3 for slower networks
```

---
