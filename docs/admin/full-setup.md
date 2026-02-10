# 🚀 AIKB Setup & Configuration Guide

This guide will help you connect your AIKB system to Gemini and Google Drive.

> [!TIP]
> **New to AI?** Use the **Easy Mode** (Option 1) for a 5-minute setup with no cloud infrastructure required.

---

## 🛠️ Step 1: Initial System Configuration

Before starting, open the `.env` file in the `server` folder with a text editor (like Notepad).

### A. Set your Admin Login

Find these lines and set your desired login details:

```env
INITIAL_ADMIN_EMAIL=admin@aikb.com
INITIAL_ADMIN_PASSWORD=Admin@123456
INITIAL_ADMIN_NAME=System Admin
```

> [!IMPORTANT]
> **Password Policy**: The system enforces high security. Your password must be **10+ characters**, containing at least one **Uppercase** letter, one **Lowercase** letter, one **Number**, and one **Special Character**.

### B. Choose your AI Mode (Standard vs. Enterprise)

Choose **ONE** of the options below:

#### **Option 1: Easy Mode (Recommended)**

_Best for most users. Uses a simple API key._

1. Get a key from **[Google AI Studio](https://aistudio.google.com/app/apikey)** (1-click).
2. Set these lines in your `.env`:
   ```env
   GOOGLE_API_KEY=your_copied_key_here
   VECTOR_STORE_MODE=LOCAL
   ```

#### **Option 2: Enterprise Mode (Vertex AI)**

_Best for large corporations with millions of documents._

1. Requires a Google Cloud Project with Vertex AI API enabled.
2. Set these lines in your `.env`:
   ```env
   GOOGLE_CLOUD_PROJECT_ID=your-project-id
   VECTOR_STORE_MODE=VERTEX
   ```

### C. Set the Security Secret

Look for `JWT_SECRET`. It must be a 64-character random code.

- **To generate one**: Open a terminal and run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Copy and paste the result into `JWT_SECRET=...`

---

## ☁️ Part 2: Connecting Google Drive (The Knowledge Base)

To let the AI "read" your documents, you need to connect it to a Google Drive folder.

### Step A: Get your Google "Key" 🔑

_If you already have a `google-key.json` file, skip to Step B._

1.  Ask your IT person for a **Google Service Account Key (JSON)**.
2.  Or, if you are doing it yourself:
    - Go to [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts).
    - Create a "Service Account".
    - Go to the **Keys** tab and click **Add Key > Create New Key > JSON**.
    - A file will download to your computer.

### Step B: Place the Key

1.  **Create a folder** named `data` inside the `server` folder if it is not already there.
2.  Rename the downloaded file exactly to `google-key.json`.
3.  Move this file into the `server/data/` folder.

### Step C: Share your Folder 📂

This is the most important step! Google Drive is private, so you must specifically invite the "AI" to your folder.

1.  Open your `google-key.json` file in Notepad.
2.  Find the line that says `"client_email": "something@something.iam.gserviceaccount.com"`.
3.  **Copy that email address.**
4.  Go to the Google Drive folder where your documents are.
5.  Right-click the folder > **Share**.
6.  Paste the email address you copied and give it **Viewer** (or Editor) access.
7.  Click **Send**.

### Step D: Update your Configuration

1.  Open the Google Drive folder in your browser.
2.  Look at the URL in the address bar. It looks like this:
    `drive.google.com/drive/folders/ABC_123_XYZ`
3.  Copy the part after `/folders/` (in this example: `ABC_123_XYZ`). This is your **Folder ID**.
4.  Open your `.env` file again and paste it here:
    ```env
    GOOGLE_DRIVE_FOLDER_ID=ABC_123_XYZ
    ```

---

## 🏁 You're Done!

Restart your app. The AI will now begin "reading" the documents in that folder. You can see the progress in the **Dashboard** under **Sync Status**.

Need help? Contact support@aikb.example.com
