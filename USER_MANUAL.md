# 📘 The Ultimate Beginner's Guide to AIKB

Welcome! This manual is designed for **absolute beginners**. You do not need to be a coding expert to get this running. Follow these steps exactly, and you will have your own AI Knowledge Base up and running in 10 minutes.

---

## ✅ Checklist: What You Need

Before we start, make sure you have these installed on your computer:

1.  **Node.js**: [Download Here](https://nodejs.org/en/download/prebuilt-installer). (Select the **LTS** version).
2.  **Git**: [Download Here](https://git-scm.com/downloads). (Click "Next" through all options).
3.  **A Google Account**: (Gmail works fine) for accessing Google Drive documents (optional for "Mock Mode").

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

**Note**: The batch file starts two programs:
*   **Backend Server** (Black window titled "AIKB-SERVER"): This is the brain of the app.
*   **Frontend Client** (Black window titled "AIKB-CLIENT"): This is the user interface.

Keep both windows open while using the app.

---

## 🧪 Part 2: Testing in "Mock Mode" (No Keys Needed!)

Want to see the app work immediately without setting up Google Cloud? **Mock Mode** is perfect for this.

1.  After running `run_app.bat`, the app is already in **Mock Mode** by default.
2.  **Login**: Use any email/password (e.g., `test@test.com` / `password`).
3.  **Add a Document**: Click "Add Document" and enter:
    *   Title: "Office Rules"
    *   Category: "HR"
    *   Content: "The office is open from 9 AM to 5 PM. Lunch is at 1 PM."
4.  **Ask a Question**: Go to the "Chat" tab and ask: "When is lunch?"
5.  The AI will answer based on your document.

**This is great for demos and testing!**

---

## 🔑 Part 3: Using Real AI (Google Cloud Setup)

To use real AI with your actual Google Drive documents, follow these steps.

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

The system uses a standard **Unified Login**. Enter your email and password to access your specific role (Admin, Manager, or Employee).

**Initial Demo Credentials:**

- **Admin**: `alice@aikb.com` | `admin123`
- **Employee**: `david@aikb.com` | `admin123`

> [!IMPORTANT] > **Authentication Type**: This system uses a secure **Internal Login** (Email/Password). It does NOT require a "Google Login" for individual employees. Access to Google Drive is handled automatically in the background using the company's central [Service Account](file:///c:/Faraatar-TID_Apps/KnowledgeManagement/DEPLOYMENT_GUIDE.md#L25).

> [!NOTE]
> When moving to **Production** (using `.env` and a real database), the app will automatically create your first Admin account on startup using the `INITIAL_ADMIN_*` variables in your `.env`. See the [Deployment Guide](file:///c:/Faraatar-TID_Apps/KnowledgeManagement/DEPLOYMENT_GUIDE.md) for details.

### 2. How to Add Resources (Sync & Upload)

1. Log in as **Alice (Admin)**.
2. Click the **Add Resource** button (Top Right).
3. **Choose your Method**:
   - **Google Drive Sync**: Best for batch-importing entire folders.
   - **Manual Upload**: Securely upload a PDF/Word file directly from your computer.

### 3. Monitoring the System (Dashboard)

Admins can monitor the health and performance of the Knowledge Base via the **Dashboard** indicators:

- **Total Documents**: The total number of files currently indexed and searchable by the AI.
- **Active Users**: The number of team members currently registered in the system.
- **AI Resolution**: The "Success Rate" of the AI. It calculates the percentage of user questions that were successfully answered using documents from your library versus questions where no matching info was found.
- **System Health**: A real-time heart-beat monitor.
  - **Optimal**: All systems (Google Drive, Gemini AI, Database) are connected.
  - **Warning**: The system is running in "Demo Mode" or a minor connection issue exists.
  - **Critical**: A major service is down. Use the "Sync" button or check `.env` settings.

### 4. Document Organization (Automation)

The system can automatically assign **Department**, **Category**, and **Sensitivity** as it syncs.

#### Method A: Smart Filenaming

Include keywords in the file name:

- **IT**: `it`, `security` (e.g., `it_guide.pdf`)
- **Compliance**: `legal`, `compliance`
- **Marketing**: `marketing`, `sales`
- **Engineering**: `engineering`, `product`

#### Method B: Explicit YAML Headers

For 100% control, paste this block at the **very first line** of your Google Doc or Text/Markdown file:

```yaml
---
department: Engineering
category: Technical Specification
sensitivity: CONFIDENTIAL
---
```

### 4. Managing Settings

Admins can go to **Settings** to:

1.  **Categories**: Define organizational tags (e.g., "HR", "Legal").
2.  **Departments**: Define user groups.

- **File Scanning**: Uploaded files are checked for dangerous types (like .exe).

### 5. Read-Only Guarantee (Google Drive Protection)

The system is designed with a **"Read-Only" Data Path** for all non-admin users.

- **Isolation**: Employees (Viewers/Managers) never have access to your Google credentials or the Drive folder directly.
- **Firewall**: Even if a user tries to "hack" the app, the backend verifies their role (Admin-only) before any file can be synced or uploaded.
- **Directional Sync**: The AIKB app only _reads_ from Google Drive to index data. It does not have buttons to "edit," "delete," or "overwrite" your original files on Google Drive.

### 6. Security Tiers & Permissions

The system uses a **Clearance Tier** logic to protect sensitive data. Users can only access/chat with documents that match their Role and Department.

| Document Sensitivity | Required Role         | Department Match?      |
| :------------------- | :-------------------- | :--------------------- |
| **INTERNAL**         | Viewer or higher      | Yes (unless Admin)     |
| **CONFIDENTIAL**     | Editor or higher      | Yes (unless Admin)     |
| **RESTRICTED**       | **Manager** or higher | **Yes** (unless Admin) |
| **EXECUTIVE**        | **Admin** only        | Global (No match req)  |

> [!TIP] > **Admins** bypass all department restrictions and can access all documents across the entire company.

### 7. AI Grounding & Trust (Anti-Hallucination)

This system is built for **High-Fidelity Accuracy**. The AI agent is designed to prioritize **Accuracy over Confidence**.

- **Machine-Verified Quotes**: The system includes an automated "Integrity Engine" that machine-checks every AI quote against your source documents. If a quote is "invented," it is flagged in the audit logs.
- **Confidence Levels**: Every AI response starts with an explicit confidence rating (High, Medium, or Low).
- **Missing Info Breakdown**: The AI will explicitly list exactly what is **missing** from its knowledge for any specific question.
- **Proactive Clarification**: If your question is vague, the AI will ask for more details instead of guessing.
- **Verbatim Technical Data**: The AI is strictly forbidden from changing technical keywords, acronyms, or numbers.
- **Literalism**: The AI avoids "reading between the lines." It only reports what is explicitly written.

### 8. Error Handling & Recovery

The system includes robust error handling to prevent data loss:

#### Request Timeouts
- **30-Second Timeout**: If the AI takes longer than 30 seconds to respond, the request is cancelled
- **User Message**: "Request timed out. Please try again."
- **Action**: Retry the question or check if backend is running

#### Sync Failures
If document sync fails:
- **Local Save**: Your document is always saved locally first
- **Error Message**: "Document saved locally. Cannot connect to server for AI sync."
- **Recovery**: The system will automatically retry sync when connection is restored

#### Cross-Tab Synchronization
- **Real-time Updates**: If you log out in another tab, this tab will automatically log out
- **Storage Sync**: Changes to documents appear instantly across all open tabs

#### What Users See During Errors
- **Network Errors**: "Cannot connect to server. Please check if backend is running."
- **Large Files**: "Request too large." (This shouldn't happen with proper RAG)
- **General Errors**: Specific error message with actionable steps

---

## ❓ Troubleshooting

- **"Sync failed"**: Did you share the Drive folder with the Service Account email?
- **"Vertex AI error"**: Did you enable the API in Google Cloud Console?
- **"Login failed"**: Check if you are using the correct email/password (alice@aikb.com / admin123).

---

**Enjoy your new AI Brain!**
