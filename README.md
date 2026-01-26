# 🧠 AI Knowledge Base (AIKB)

> **Your company's intelligent assistant that reads documents and answers questions.**

AIKB is a **smart search engine** for your company documents. Instead of searching through hundreds of files manually, you just **ask a question** and the AI finds the answer.

---

## 🎬 How It Works

| 🧩 Part            | 🛠️ What It Does                          | 💡 Simple Example                    |
| :----------------- | :--------------------------------------- | :----------------------------------- |
| **🧠 The Brain**   | AI that reads and understands text       | A librarian who memorized every book |
| **📚 The Library** | Stores "fingerprints" for quick search   | An efficient index card system       |
| **🔐 The Guard**   | Checks who you are and what you can see  | A security checkpoint at the door    |
| **🖥️ The Website** | Where you type questions and see answers | A simple search engine interface     |

---

## 🚀 Quick Start (5 Minutes)

### 1. Open Two Terminals (Command Prompt)

**Windows:** Press `Win + R`, type `cmd`, press Enter. Do this **twice**.

### 2. Start the "Brain" (Server)

In the first window, type:

```bash
cd C:\Faraatar-TID_Apps\KnowledgeManagement\server
npm install
npm run dev
```

Wait for: `✅ SERVER ACTIVE ON PORT 3001`

### 3. Start the "Website" (Client)

In the second window, type:

```bash
cd C:\Faraatar-TID_Apps\KnowledgeManagement\client
npm install
npm run dev
```

Wait for: `Ready in X seconds`

### 4. Login & Enjoy

1. Open browser: **http://localhost:3000**
2. Login with:
   - 📧 Email: `alice@aikb.com`
   - 🔑 Password: `admin123`
3. **Ask a question!** The AI will answer based on your documents.

---

## 📚 Reference Guides

| I want to...           | Read this                         |
| :--------------------- | :-------------------------------- |
| **Learn all features** | [User Guide](USER_GUIDE.md)       |
| **Set up for a team**  | [Deployment Guide](DEPLOYMENT.md) |
| **See what's changed** | [Changelog](CHANGELOG.md)         |

---

## 🔐 Security Highlights

- ✅ **Military-grade Encryption**: Passwords are scrambled and safe.
- ✅ **Need-to-Know Access**: Users only see documents for their department.
- ✅ **Private by Design**: Your API keys and data stay on your secure server.
- ✅ **Safety Controls**: Only document owners can modify their files.

---

## 🆘 Troubleshooting

| Problem                   | Solution                                                           |
| :------------------------ | :----------------------------------------------------------------- |
| **"Port already in use"** | Restart your computer or close other terminal windows.             |
| **"Login fails"**         | Make sure you used the email `alice@aikb.com`. Check spelling.     |
| **"AI says mock data"**   | Normal for "Demo Mode". Ask your IT admin to connect Google Cloud. |
| **"Can't reach website"** | Make sure both terminal windows are still open and running.        |

---

## 🧑‍💻 Technical Info

### Run Tests

```bash
cd server && npm test   # Check the brain (73 tests)
cd client && npm test   # Check the website (12 tests)
```

### Technology Stack

- **AI Engine**: Google Gemini 2.5
- **Frontend**: Next.js 15 + React 19
- **Backend**: Node.js + Express
- **Database**: Local JSON (Simple) or Supabase (Advanced)

---

**Developed by Antigravity AI** | January 2026
