# 🧪 Alpha Testing Guide: AI Knowledge Base

Welcome to the Alpha Phase of AIKB!
This guide is designed for **Alpha Testers** to systematically verify the core functionality of the application.

---

## 🎯 Objective

To confirm that the "Brain" of the system works:

1.  **Ingestion**: It can read documents (Drive Sync & Upload).
2.  **Recall**: It can find relevant information.
3.  **Synthesis**: It can answer questions accurately using that information.
4.  **Security**: It respects user roles.

---

## 🛠️ Setup for Testers

1.  **Start the App**: Double-click `run_app.bat`.
2.  **Open Browser**: Go to `http://localhost:3000`.
3.  **Credentials**:

| Role       | Email            | Password   | Goal                               |
| :--------- | :--------------- | :--------- | :--------------------------------- |
| **Admin**  | `alice@aikb.com` | `admin123` | Test Uploads, Settings, Sync       |
| **Viewer** | `david@aikb.com` | `admin123` | Test Chat restrictions (Read-only) |

---

## 📝 Test Scenarios (Checklist)

### 1. Authentication Check

- [ ] **Login as Admin**: Click "Admin Console". Should verify success (see Dashboard).
- [ ] **Logout**: Click Profile > Logout. Should return to Login screen.
- [ ] **Login as Viewer**: Click "Employee Login". Should verify success (limited view).

### 2. Manual Upload (The "Speed" Test)

_Log in as **Admin**._

- [ ] **Navigate**: Go to "Add Resource" (Top Right).
- [ ] **Upload**: Select "Manual Upload".
- [ ] **File**: Choose a PDF or Word doc from your computer (e.g., a policy doc).
- [ ] **Verify**:
  - Does it say "Success"?
  - Go to **Library**: Is the file listed there?
  - **Wait 10 seconds** for indexing.

### 3. The "Brain" Test (Chat)

_Log in as **Admin** or **Viewer**._

- [ ] **Ask a Question**: Ask something specific about the file you just uploaded.
  - _Example: "What is the policy on remote work according to the uploaded doc?"_
- [ ] **Verify Answer**:
  - Is the answer accurate?
  - Does it cite the **Source** (the file name)?
- [ ] **Context Test**: Ask a follow-up.
  - _Example: "Does this apply to contractors too?"_ (It should remember previous context).

### 4. Security & Permissions

- [ ] **Viewer Upload Block**:
  - Log in as **David (Viewer)**.
  - Try to find the "Add Resource" button. (It should be missing or disabled).
  - If you try to access `http://localhost:3000/admin`, you should be redirected or blocked.

### 5. Drive Sync (Optional)

_Requires Google Drive Setup._

- [ ] **Sync**: Go to Admin > Dashboard > "Sync Now".
- [ ] **Verify**: Check Activity Log for "Drive Sync" event.

---

## 🐛 How to Report Bugs

If you find a bug (e.g., "Answer was wrong" or "Upload failed"), please record:

1.  **What you did**: (Step-by-step)
2.  **What happened**: (Error message or behavior)
3.  **Screenshots**: Extremely helpful.
4.  **Logs**: Check the black console window for errors (Red text).

**Send reports to:** [Project Manager Email / Slack Channel]

---

**Thank you for helping us build a smarter brain!** 🧠
