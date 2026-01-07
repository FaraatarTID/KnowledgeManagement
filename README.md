# 🚀 Quick Guide

**Welcome! This is a smart assistant that reads your documents and answers questions.**

## 🎯 What You Need to Know

### For  Beginners
1. **Read:** `GUIDE_FOR_BEGINNERS.md` (Everything explained simply)
2. **Try:** `QUICK_START.md` (5-minute setup)
3. **Use:** `USER_MANUAL.md` (How to use all features)

### For Users
- **Just want to use it?** → Read `USER_MANUAL.md`
- **Want to understand how it works?** → Read `GUIDE_FOR_BEGINNERS.md`

### For Admins
- **Setting up for your team?** → Read `DEPLOYMENT_GUIDE.md`
- **Need a checklist?** → Read `DEPLOYMENT_CHECKLIST.md`

---

# AI-Native Knowledge Base (AIKB) 🧠

**Welcome to AIKB!**

This is an intelligent "Brain" for your company. It connects to your **Google Drive**, reads your documents, and lets you ask questions about them using state-of-the-art AI. It's designed to be secure, private, and easy to run.

---

## 🚀 What's New? (The "Dummies" Guide)

We've made major upgrades to make this system **secure, scalable, and production-ready**. Here's what changed:

### 1. **Frontend + Backend Architecture** 🏗️
*   **Before**: The app ran entirely in your browser, which was insecure and limited.
*   **Now**: We have a separate **Backend Server** (Node.js) that handles all the heavy lifting. This keeps your API keys safe and allows for powerful features.

### 2. **Smart AI (RAG - Retrieval Augmented Generation)** 🧠
*   **Before**: The AI read *every single document* for *every single question*. This was slow and expensive.
*   **Now**: The AI uses a "Smart Search" to find only the **3 most relevant documents** before answering. This saves time and money.

### 3. **Security Fixes** 🛡️
*   **API Keys**: Your AI API keys are now hidden safely on the server. No one can steal them from the browser.
*   **Unique IDs**: We now use proper UUIDs instead of timestamps, preventing data collisions.

### 4. **Performance Boost** ⚡
*   **Search**: Typing in the search box is now instant, even with thousands of documents.

---

## 🏁 Getting Started (Easy Mode)

We have written two guides depending on what you want to do:

### 1. "I just want to run it on my laptop"

👉 Read the **[User Manual (Beginner's Guide)](USER_MANUAL.md)**
_(Includes the 1-Click Windows Setup!)_

### 2. "I want to deploy this for my team"

👉 Read the **[Deployment Guide](DEPLOYMENT_GUIDE.md)**
_(Instructions for Servers, Docker, and Database)_

---

## 💻 For Developers

### Quick Start (Mock Mode)

If you want to test the system without real Google Cloud credentials, follow these steps:

1.  **Install Dependencies**:
    ```bash
    # In the client directory
    cd client
    npm install

    # In the server directory
    cd ../server
    npm install
    ```

2.  **Setup Environment Variables**:
    *   Create a `.env` file in the `server` directory.
    *   Copy the contents of `.env.example` into `.env`.
    *   **Important**: Ensure `GOOGLE_CLOUD_PROJECT_ID=aikb-mock-project` is set.

3.  **Run the Backend**:
    ```bash
    cd server
    npm run dev
    ```
    *You should see "GeminiService initialized in MOCK MODE."*

4.  **Run the Frontend**:
    ```bash
    cd client
    npm run dev
    ```

5.  **Open your browser** to `http://localhost:3000` and enjoy!

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
