# 📘 The Ultimate Beginner's Guide to AIKB

Welcome! This manual is designed for **absolute beginners**. You do not need to be a coding expert to get this running. Follow these steps exactly, and you will have your own AI Knowledge Base up and running in 10 minutes.

---

## ✅ Checklist: What You Need

Before we start, make sure you have these installed on your computer:

1.  **Node.js**: [Download Here](https://nodejs.org/en/download/prebuilt-installer). (Select the **LTS** version).
2.  **Git**: [Download Here](https://git-scm.com/downloads). (Click "Next" through all options).
3.  **A Google Account**: (Gmail works fine) for accessing Google Drive documents.

---

## 🚀 Part 1: Initial Setup

### 1. Download the App

1.  Open your command prompt (**Cmd**) or **PowerShell**.
2.  Type this command and press Enter:
    ```bash
    git clone https://github.com/FaraatarTID/KnowledgeManagement
    ```
3.  Go into the folder:
    ```bash
    cd KnowledgeManagement
    ```

### 2. The "One-Click" Install (Windows)

1.  Open the `KnowledgeManagement` folder in your File Explorer.
2.  **Double-click `run_app.bat`.**
3.  A black window will pop up. **Wait.** It might take 5 minutes to install everything.
4.  Once ready, **your browser will open automatically** to the login page.
5.  If it doesn't open, manually go to `http://localhost:3000`.

---

## 🔑 Part 2: Getting Your "Secret Keys" (Free)

To make the AI work, we need to give it permission to read your Drive.

### Step A: Google Cloud API

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a **New Project** named `My-AIKB`.
3.  **Enable AI & Drive**:
    - Search for "**Vertex AI API**" and click **Enable**.
    - Search for "**Google Drive API**" and click **Enable**.
4.  **Create Service Account**:
    - Go to **IAM & Admin** > **Service Accounts**.
    - Click **Create Service Account**. Name it `aikb-backend`.
    - Once created, **Copy the Email Address** of this account (you'll need it later!).
5.  **Get the Key File**:
    - Click the email address you just copied > **Keys** tab > **Add Key** > **JSON**.
    - A file will download. Rename it to `gcp-key.json`.
    - **Move this file** into the `KnowledgeManagement\server` folder.

> [!IMPORTANT] > **CRITICAL STEP**: Go to the Google Drive folder you want to use. Right-click > **Share**.
> **Paste the Email Address** of the service account you copied in Step 4. Give it "**Viewer**" access. Without this, the AI cannot see your files!

---

## ⚙️ Part 3: Connecting the Dots (.env)

1.  Open `KnowledgeManagement\server\.env.example`.
2.  Save it as a new file named `.env`.
3.  Open `.env` in Notepad and fill in your keys:

```ini
# --- SECURITY (Required) ---
JWT_SECRET=super_secret_password_here_make_it_long  # CRITICAL! App will not start without this.

# --- GOOGLE CLOUD (Required) ---
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE=gcp-key.json

# --- GOOGLE DRIVE (Required) ---
GOOGLE_DRIVE_FOLDER_ID=your-folder-id  # The ID from your Drive folder URL

# --- AI MODELS (Defaults) ---
GEMINI_MODEL=gemini-2.5-flash-lite-001
EMBEDDING_MODEL=text-embedding-004

# --- DATABASE (Optional) ---
# For document history and persistent users. Leave blank to use Demo Mode.
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 🎉 Part 4: Using the App

### 1. Logging In

By default (if no database is configured), the system runs in **Demo Mode**. Use these credentials:

| Role       | Email            | Password   | Access                              |
| :--------- | :--------------- | :--------- | :---------------------------------- |
| **Admin**  | `alice@aikb.com` | `admin123` | Full Access (Settings, Users, Sync) |
| **Viewer** | `david@aikb.com` | `admin123` | Read Only (Chat)                    |

### 2. How to Add Resources (Sync & Upload)

1. Log in as **Alice (Admin)**.
2. Click the **Add Resource** button (Top Right).
3. **Choose your Method**:
   - **Google Drive Sync**: Best for batch-importing entire folders.
   - **Manual Upload**: Securely upload a PDF/Word file directly from your computer.

### 3. Managing Settings

Admins can go to **Settings** to:

1.  **Categories**: Define organizational tags (e.g., "HR", "Legal").
2.  **Departments**: Define user groups.

### 4. Security Note

This app uses robust security measures:

- **Rate Limiting**: Brute-force attacks are blocked.
- **Secure Sessions**: Login sessions use HTTP-Only cookies to prevent theft.
- **File Scanning**: Uploaded files are checked for dangerous types (like .exe).

---

## ❓ Troubleshooting

- **"App closes immediately"**: Did you set `JWT_SECRET` in `.env`? It is required.
- **"Sync failed"**: Did you share the Drive folder with the Service Account email?
- **"Vertex AI error"**: Did you enable the API in Google Cloud Console?
- **"Login failed"**: Check if you are using the correct email/password (alice@aikb.com / admin123).

---

**Enjoy your new AI Brain!**
