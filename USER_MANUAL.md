# 📘 The Ultimate Beginner's Guide to AIKB

Welcome! This manual is designed for **absolute beginners**. You do not need to be a coding expert to get this running. Follow these steps exactly, and you will have your own AI Knowledge Base up and running in 10 minutes.

---

## ✅ Checklist: What You Need

Before we start, make sure you have these installed on your computer. If not, click the links to download and install them:

1.  **Node.js**: [Download Here](https://nodejs.org/en/download/prebuilt-installer).
    - _Tip_: Download the "LTS" (Long Term Support) version. Just click "Next" until it's installed.
2.  **Git**: [Download Here](https://git-scm.com/downloads).
    - _Tip_: Just click "Next" through all the options.
3.  **A Google Account**: (Gmail works fine).
4.  **A Supabase Account**: [Sign Up Here](https://supabase.com) (It's free).

---

## 🚀 Part 1: Initial Setup

### 1. Download the App

1.  Open your command prompt (Cmd) or Terminal.
2.  Type this command and press Enter:
    ```bash
    git clone https://github.com/FaraatarTID/KnowledgeManagement
    ```
    _(Replace the URL with your actual repository URL)_
3.  Go into the folder:
    ```bash
    cd KnowledgeManagement
    ```

### 2. The "One-Click" Install (Windows Users)

If you are on Windows, we made this super easy for you.

1.  Open the `KnowledgeManagement` folder in your File Explorer.
2.  Find the file named **`run_app.bat`**.
3.  **Double-click it.**
4.  A black window will pop up. **Wait.** It might take 5 minutes to install everything.
5.  If it says "Ready", you are good! But wait! **You still need to add your passwords/keys.** Close the window for now.

---

## 🔑 Part 2: Getting Your "Secret Keys" (Free)

This is the hardest part, but just follow the screenshots/steps below.

### Step A: Google Cloud (For the AI)

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Click **"Select a Project"** at the top left > **"New Project"**.
3.  Name it `My-AIKB` and click **Create**.
4.  **Enable AI**:
    - Search for "Vertex AI API" (For Gemini 2.5 Flash-Lite & Embeddings).
    - Click **Enable**.
5.  **Enable Drive**:
    - Search for "Google Drive API".
    - Click **Enable**.
6.  **Get the Key File**:
    - Go to **IAM & Admin** > **Service Accounts** (left menu).
    - Click **Create Service Account**. Name it `aikb-backend`. Click Done.
    - Click the email address of the account you just created.
    - Go to the **Keys** tab > **Add Key** > **Create new key** > **JSON**.
    - A file will automatically download. **Rename this file to `gcp-key.json`**.
    - **Move this file** into the `KnowledgeManagement\server` folder on your computer.

### Step B: Supabase (For the Database)

1.  Log in to [Supabase](https://supabase.com/dashboard).
2.  Click **"New Project"**. Give it a name and a strong password.
3.  Wait for it to setup (takes ~2 mins).
4.  Go to **Project Settings** (gear icon) > **API**.
5.  Copy the **URL**.
6.  Copy the **anon / public** Key.
7.  Save these for the next step.
8.  Go to **Project Settings** > **Database** > **Connection String** > **URI**. Copy it.

### Step C: Google Login (For YOU)

1.  Back in Google Cloud Console, search for **"OAuth Consent Screen"**.
2.  Select **External**, then Create.
3.  Fill in "App Name" (AIKB) and your email. Click Save/Next until done.
4.  Go to **Credentials** (left menu) > **Create Credentials** > **OAuth Client ID**.
5.  Application Type: **Web Application**.
6.  **Authorized Redirect URIs**: Click "Add URI" and paste:
    `http://localhost:3001/auth/google/callback`
7.  Click Create.
8.  Copy the **Client ID** and **Client Secret**.

---

## ⚙️ Part 3: Connecting the Dots

1.  Open the `KnowledgeManagement\server` folder.
2.  You will see a file named `.env.example`.
3.  Make a copy of it and rename the copy to `.env` (just `.env`, nothing else).
4.  Open `.env` with Notepad.
5.  Paste your secrets where they belong:

```ini
# --- SERVER SETTINGS ---
PORT=3001
JWT_SECRET=super-secret-password-123  <-- Change this to anything random

# --- GOOGLE CLOUD ---
GCP_PROJECT_ID=your-project-id-here   <-- From Google Console Dashboard
GCP_KEY_FILE=gcp-key.json             <-- This is the file you moved earlier!

# --- GOOGLE DRIVE ---
GOOGLE_DRIVE_FOLDER_ID=12345abcde     <-- Go to a Drive folder, copy ID from URL

# --- SUPABASE (DATABASE) ---
SUPABASE_URL=https://your-url.supabase.co
SUPABASE_ANON_KEY=eyJh...             <-- Your long key
DATABASE_URL=postgresql://...         <-- Your Connection String

# --- LOGIN ---
GOOGLE_CLIENT_ID=...                  <-- From Step C
GOOGLE_CLIENT_SECRET=...              <-- From Step C
```

6.  Save the file.

---

## 🎉 Part 4: Launch Time!

1.  Go back to the root folder.
2.  Double-click `run_app.bat` again.
3.  Wait for two windows to open.
4.  Open your browser (Chrome/Edge).
5.  Go to: [http://localhost:3000](http://localhost:3000)

**You are done!** You can now chat with your documents.

### ❓ Troubleshooting

- **"Command not found"?** -> You didn't install Node.js. Install it and restart your computer.
- **"White screen"?** -> Check the black command windows for errors.
- **"Login failed"?** -> Check your Google Client ID/Secret in the `.env` file.
