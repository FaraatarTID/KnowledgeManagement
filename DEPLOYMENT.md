# 🌍 Production Deployment Guide: AIKB on the Web

This guide explains how to take the AIKB app from your computer and put it on the internet so your whole company can use it securely.

### 🔑 Admin Bootstrapping

On the first run with a fresh database, the system automatically creates the initial Admin user. By default, it uses:

- **Email**: `alice@aikb.com`
- **Password**: `admin123`

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
```

> [!TIP]
> The server uses **Zod Validation**. If any of the above variables are missing or incorrectly formatted (e.g. invalid URL), the app will provide a detailed checklist of errors and refuse to start. This prevents "Ghost Failures".

---

## 🪵 Structured Logging

In production (`NODE_ENV=production`), the system outputs **Structured JSON Logs**. This is designed for high-end observability tools like ELK, Datadog, or Grafana Loki.

**Example Log Object:**

```json
{
  "timestamp": "2026-01-26T12:00:00Z",
  "level": "INFO",
  "message": "SERVER ACTIVE ON PORT 3001",
  "node_env": "production"
}
```

This allows IT teams to set up precise alerts on `level: "ERROR"` without complex text parsing.

---

### 2. Initialize Database (Supabase)

Run this SQL in your Supabase Dashboard to create the necessary tables:

```sql
-- 1. History Log
create table document_history (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  event_type text not null,
  doc_id text not null,
  doc_name text not null,
  details text,
  user_id text
);

-- 2. Users (Role-Based Access)
create table users (
  id uuid default gen_random_uuid() primary key,
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  name varchar(255) not null,
  role varchar(50) default 'VIEWER',
  department varchar(100) default 'General',
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

_Note: Tests might fail if Supabase/GCP isn't configured in `.env`, but "Mock Mode" should pass._

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

### Telemetry Events to Watch

Monitor these patterns for system health:

- **Errors**: `grep '"level":"ERROR"'`
- **Security Alerts**: `grep '"action":"UNAUTHORIZED"'`
- **Sync Alerts**: `grep 'SYNC_FAILED'`

### Key Metrics (Accessible via `/health`)

The `/health` endpoint is **Deep**. It checks:

- **Disk Access**: Verifies the `data/` folder is writeable.
- **Memory RSS**: Monitor this to detect leaks or heavy loads.
- **Vector Count**: Tracks the size of your local knowledge base.

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
