# AI-Native Knowledge Base (AIKB) 🧠

**Welcome to AIKB!**

This is an intelligent "Brain" for your company. It connects to your **Google Drive**, reads your documents, and lets you ask questions about them using state-of-the-art AI. It's designed to be secure, private, and easy to run.

---

## 🌟 Capabilities

- **🧠 It Knows Your Data**: Unlike generic ChatGPT, this AI answers using only your private company documents.
- **🛡️ Enterprise Security**:
  - **Custom Authentication**: Secure login system with role-based access.
  - **Rate Limiting**: Protects against abuse.
  - **Input Validation**: Rejects malicious files (e.g., `.exe` malware).
- **🚀 Dynamic & Fast**:
  - **Dashboard**: Real-time statistics on document usage.
  - **Manual Uploads**: Upload urgent files directly via the UI for instant indexing.
  - **Google Drive Sync**: Automatically stays in sync with your cloud folders.
  - **Smart Organization**: Uses filename keywords and YAML headers for automated classification.
- **⚡ Developer Friendly**:
  - **Tested**: Includes an automated test suite.
  - **Portable**: Runs on Windows, Mac, or Linux.

---

## 🏁 Getting Started

We have written two guides depending on what you want to do:

### 1. "I just want to run it on my laptop"

👉 Read the **[User Manual (Beginner's Guide)](USER_MANUAL.md)**
_(Includes the 1-Click Windows Setup!)_

### 2. "I want to deploy this for my team"

👉 Read the **[Deployment Guide](DEPLOYMENT_GUIDE.md)**
_(Instructions for Servers, Docker, and Database)_

---

## 💻 For Developers

### Project Structure

- **`client/`**: Next.js (React) Frontend.
- **`server/`**: Node.js (Express) Backend with Vector Search.
- **`run_app.bat`**: Windows automation script.

### Running Tests

Before making changes, verify the system integrity:

```bash
cd server
npm test
```

This runs the **Vitest** suite to check authentication, API security, and basic routes.

---

**Developed by Antigravity AI**
