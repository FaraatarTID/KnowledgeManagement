# 📘 The Ultimate Beginner's Guide to AIKB

Welcome! This manual is designed for **absolute beginners**. You do not need to be a coding expert to get this running. Follow these steps exactly, and you will have your own AI Knowledge Base up and running in 10 minutes.

---

## ✅ Checklist: What You Need

Before we start, make sure you have these installed on your computer:

1.  **Node.js**: [Download Here](https://nodejs.org/en/download/prebuilt-installer). (Select the **LTS** version).
2.  **Git**: [Download Here](https://git-scm.com/downloads). (Click "Next" through all options).
3.  **A Google Account**: (Gmail works fine).

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

### Step A: Google Cloud (For the AI)

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

### Step B: Google Login (For the App)

1.  Search for "**OAuth Consent Screen**". Select **External**, then Create. Fill in the basics.
2.  Go to **Credentials** > **Create Credentials** > **OAuth Client ID**.
3.  Application Type: **Web Application**.
4.  **Authorized Redirect URIs**: Click "Add URI" and paste:
    `http://localhost:3001/auth/google/callback`
5.  Click Create. Save the **Client ID** and **Client Secret**.

---

## ⚙️ Part 3: Connecting the Dots

1.  Open `KnowledgeManagement\server\.env.example`.
2.  Save it as a new file named `.env`.
3.  Open `.env` in Notepad and fill in your keys:

```ini
# --- SECURITY ---
JWT_SECRET=anything_random_here  # Change this!

# --- GOOGLE CLOUD ---
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE=gcp-key.json

# --- GOOGLE DRIVE ---
GOOGLE_DRIVE_FOLDER_ID=your-folder-id  # Found in the Drive URL

# --- AI MODELS (Defaults) ---
GEMINI_MODEL=gemini-2.5-flash-lite-001
EMBEDDING_MODEL=text-embedding-004

# --- LOGIN ---
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# --- DATABASE (Optional for History) ---
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-key
```

---

## 🎉 Part 4: Using the App

### 1. Logging In

- **Employee Login**: Simulates a regular user. They can only see documents in their department.
- **Admin Console**: Simulates an administrator. They can see all documents and trigger syncs.

### 2. How to Add Resources (Sync & Upload)

1. Log in as an **Admin**.
2. Go to the **Dashboard** or **Library**.
3. Click the **Add Resource** button (Top Right).
4. **Choose your Method**:
   - **Google Drive Sync**: Best for batch-importing entire folders.
   - **Manual Upload**: Best for single documents you want indexed _right now_.
5. If manually uploading, select the **Department** and **Category** from the dropdowns and click **Upload**. The file will be saved to your Google Drive and indexed by the AI instantly.

### 3. Managing Settings (Categories & Departments)

Admins can tailor the system to their organization:

1. Go to the **Admin Console**.
2. Click on the **Settings** tab.
3. Use the **Categories** and **Departments** managers to add or remove items.
4. These items will immediately appear in all dropdowns throughout the app (Edit Metadata, User Management, etc.).

### 4. The Activity Log (New!)

1.  Go to the **Admin Console**.
2.  Click on **Activity Log** in the sidebar.
3.  You can see a chronological history of every time a document was created or updated in the AI's memory. This is great for verifying that your latest edits in Drive have actually been "learned" by the AI.

### Managing Documents

Once documents are indexed, Admins and Managers can manage them via the **Admin Console -> Library** tab:

1.  **Edit Metadata**: Click the **Edit (Pencil)** icon to change:
    - **Title**: Renames the document in the AIKB (and attempts to update the file name in Google Drive).
    - **Category**: Update the organizational category.
    - **Sensitivity**: Change the data sensitivity level.
2.  **Sync Stability**: Changes made in the AIKB are "Sync-Stable." This means if you rename a document or change its category in the AIKB, subsequent Google Drive syncs will **not** revert your changes. The AIKB local record acts as the source of truth for metadata once manually edited.
3.  **Delete document**: Click the **Trash** icon to remove a document from the AI index.

---

## 🛡️ Part 5: Roles & Privileges

The system uses Role-Based Access Control (RBAC) to ensure security.

| Feature                | Admin | Manager | Editor | Viewer |
| :--------------------- | :---: | :-----: | :----: | :----: |
| **Chat with AI**       |  ✅   |   ✅    |   ✅   |   ✅   |
| **View Own Dept Docs** |  ✅   |   ✅    |   ✅   |   ✅   |
| **View All Dept Docs** |  ✅   |   ❌    |   ❌   |   ❌   |
| **Add/Sync Resources** |  ✅   |   ❌    |   ❌   |   ❌   |
| **Edit Doc Metadata**  |  ✅   |   ✅    |   ❌   |   ❌   |
| **Manage Settings**    |  ✅   |   ❌    |   ❌   |   ❌   |
| **Manage Users**       |  ✅   |   ❌    |   ❌   |   ❌   |
| **View Activity Log**  |  ✅   |   ✅    |   ❌   |   ❌   |

---

### 🎖️ Advanced: Document Metadata (YAML)

Add this to the very top of your documents **before syncing** to pre-define access:

```yaml
---
title: "Quarterly Safety Report"
department: "Safety"
sensitivity: "CONFIDENTIAL"
category: "Reports"
---
```

---

### ❓ Troubleshooting

- **"Sync failed/Empty results"**: Did you share the Drive folder with the Service Account email?
- **"Vertex AI error"**: Make sure you clicked "Enable" on the Vertex AI API in Google Cloud.
- **"Login failed"**: Ensure your redirect URI in Google Console is exactly `http://localhost:3001/auth/google/callback`.
- **"Time sync error"**: Ensure your computer clock matches the real time (Windows Settings > Time & Language > Sync Now).
