# AI-Native Knowledge Base (AIKB)

**Welcome to AIKB!**

This is an intelligent "Brain" for your company. It connects to your **Google Drive**, reads your documents, and lets you ask questions about them using state-of-the-art AI.

---

## 🌟 Why is this special?

- **It knows your data**: Unlike ChatGPT, this AI knows your private company secrets and policies because it reads your Google Drive.
- **Enterprise Security**: Advanced RBAC (Role-Based Access Control), PII Redaction (strips emails/phones), and Audit Logging of all queries.
- **Context-Aware Parsing**: Intelligent sentence-aware chunking and YAML Metadata support for document-level permissions.
- **Document History**: Cloud-backed Activity Logs (via Supabase) to track when the AI was last updated and which documents were synced.
- **Free-Tier Friendly**: Designed to run 100% on the free tiers of Google Cloud (Gemini 2.5 Flash-Lite) and Supabase.

---

## 🏁 Getting Started

We have written two guides depending on what you want to do:

### 1. "I just want to run it on my laptop"

👉 Read the **[User Manual (Beginner's Guide)](USER_MANUAL.md)**
_(This includes the 1-Click Windows Setup!)_

### 2. "I want to put this on a website for my team"

👉 Read the **[Deployment Guide](DEPLOYMENT_GUIDE.md)**

---

## 📂 What is in this folder?

- **`client/`**: The "Frontend". This is the website part you look at.
- **`server/`**: The "Backend". This is the brain that talks to Google and the Database.
- **`run_app.bat`**: The magic script for Windows users to start everything instantly.
- **`USER_MANUAL.md`**: Your bible for setting this up.

---

**Developed by Antigravity AI**
