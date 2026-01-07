# 🌍 Production Deployment Guide: AIKB on the Web

This guide explains how to take the AIKB app from your computer and put it on the internet so your whole company can use it securely.

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
# CRITICAL: Must be a long, random string. App will fail without it.
JWT_SECRET=production_secret_key_change_me_immediately_to_something_secure

# Google Cloud
GCP_PROJECT_ID=...
GCP_KEY_FILE=gcp-key.json
GOOGLE_DRIVE_FOLDER_ID=...

# Database (Supabase) - REQUIRED for production users
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

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
