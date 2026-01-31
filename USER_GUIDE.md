# 📘 User Guide

> **A complete guide to using the AI Knowledge Base. Written for beginners.**

---

## 🎯 What Can You Do?

| Feature           | What It Does                                   |
| ----------------- | ---------------------------------------------- |
| **Ask Questions** | Type a question, get an AI answer with sources |
| **Add Documents** | Upload files so the AI can learn from them     |
| **Search**        | Find documents by title or content             |
| **Manage Users**  | (Admin only) Add and remove team members       |

---

### User Accounts

The system distinguishes between different levels of access. Please contact your administrator for your account details.

| Role       | Recommended For  | What They Can Do        |
| ---------- | ---------------- | ----------------------- |
| **Admin**  | System Managers  | Full Control & Auditing |
| **Editor** | Content Creators | Add & Manage Documents  |
| **Viewer** | Standard Users   | Ask questions & search  |

### How to Login

1. Go to http://localhost:3000
2. Enter email and password
3. Click "ورود" (Login)

---

## 💬 Asking Questions

### How It Works

1. Type your question in the chat box at the bottom
2. Click "ارسال" (Send) or press Enter
3. Wait 2-5 seconds for the AI to respond
4. Read the answer with source documents

---

## 🛡️ AI Trust & Verification

AIKB isn't just "guessing". Every response follows a strict verification process:

1.  **[CONFIDENCE]**: The AI tells you if it found enough information (High) or is missing details (Medium/Low).
2.  **[QUOTE]**: For every major claim, the AI provides an **exact quote** from your documents.
3.  **Cross-Verification**: Our system checks these quotes. If the AI hallucinates, it will be flagged for your review.

---

## 📄 Adding Documents

### Step-by-Step

1. Click "افزودن سند" (Add Document)
2. Fill in the form:
   - **عنوان سند** (Title): Name your document
   - **دسته‌بندی** (Category): e.g., "HR", "IT"
   - **محتوا** (Content): Paste the text
3. Click "ذخیره سند" (Save Document)

---

## 🔍 Searching Documents

1. Click the "اسناد" (Documents) tab
2. Type in the search box
3. Results appear instantly

---

## 👥 User Roles

| Role       | View Docs        | Ask AI | Add Docs | Manage Users |
| ---------- | ---------------- | ------ | -------- | ------------ |
| **Viewer** | ✅ Own dept only | ✅     | ❌       | ❌           |
| **Editor** | ✅ Own dept only | ✅     | ✅       | ❌           |
| **Admin**  | ✅ Everything    | ✅     | ✅       | ✅           |

---

## 🔐 Security Features

1. **Encrypted Passwords** - Safe from theft
2. **Secure Cookies** - Protected from hackers
3. **Role-Based Access** - See only what's allowed
4. **Owner Validation** - Only you edit your docs

---

## 🌐 Persian/Farsi Guide

| English      | Persian    | Pronunciation   |
| ------------ | ---------- | --------------- |
| Login        | ورود       | Vorud           |
| Add Document | افزودن سند | Afzudan-e Sanad |
| Save         | ذخیره      | Zakhire         |
| Send         | ارسال      | Ersal           |
| Documents    | اسناد      | Asnad           |
| Search       | جستجو      | Jostoju         |

---

## 🆘 Troubleshooting

- **Login fails?** Ensure you are using the correct credentials provided by your IT department.
- **AI returns mock responses?** This signifies that real-time AI indexing is not yet connected. An administrator must configure Google Cloud credentials.
- **Page won't load?** Ensure the network is stable and the AIKB service is running.

---

## 📅 System Info

- **Admin Setup**: Check [Deployment Guide](DEPLOYMENT.md) for first-time use.
- **Google Drive**: Handled via company [Service Account](DEPLOYMENT.md).

---

**Developed by Antigravity AI**
