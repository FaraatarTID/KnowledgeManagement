# 🚀 Quick Start Guide - 5 Minutes to Success!

## 🎯 Who Is This For?

**This guide is for:**
- Complete beginners to Node.js
- People who want to see the system work immediately
- Anyone who doesn't want to read 10 pages of documentation

**You don't need to understand:**
- How AI works
- What "vectors" are
- Database concepts
- Security protocols

**Just follow these steps exactly!**

---

## 📋 Before You Start

### What You Need
1. **Windows, Mac, or Linux computer**
2. **Internet connection**
3. **5 minutes of time**

### What You DON'T Need
- ❌ Google Cloud account
- ❌ Credit card
- ❌ Programming knowledge
- ❌ Server setup

---

## 🎬 Step-by-Step Instructions

### Step 1: Open Terminal

**Windows:**
- Press `Win + R`
- Type `cmd`
- Press Enter

**Mac:**
- Press `Cmd + Space`
- Type `Terminal`
- Press Enter

**Linux:**
- Open your terminal app

---

### Step 2: Go to the Project

Type this exactly (replace with your actual folder path):
```bash
cd C:\Faraatar-TID_Apps\KnowledgeManagement
```

**If you get an error:** You're in the wrong folder. Use the `cd` command to navigate to where you extracted the project.

---

### Step 3: Install Everything

**3a. Install Server Dependencies**
```bash
cd server
npm install
```

Wait for it to finish (you'll see lots of text). This might take 2-5 minutes.

**3b. Install Client Dependencies**
```bash
cd ../client
npm install
```

Wait again. This is downloading all the tools needed.

---

### Step 4: Start the System

You need **TWO** terminal windows open.

**Terminal 1 - The Server (Brain):**
```bash
# Make sure you're in the client folder, then go back
cd ../server
npm run dev
```

You should see: `✅ SERVER ACTIVE ON PORT 3001`

**Terminal 2 - The Website (Interface):**
```bash
# Open a NEW terminal window
cd C:\Faraatar-TID_Apps\KnowledgeManagement\client
npm run dev
```

You should see: `Ready in X seconds`

---

### Step 5: Use It!

1. **Open your web browser** (Chrome, Firefox, Edge)
2. **Go to:** `http://localhost:3000`
3. **Login with:**
   - Email: `alice@aikb.com`
   - Password: `admin123`

**You should see a chat interface!**

---

## 🎉 You Did It!

### Try These Example Questions:

```
What is this system?
Who can use it?
How do I upload files?
```

The AI will give you answers based on the built-in demo documents.

---

## 📸 What You Should See

### ✅ Success Looks Like:
- Green "Live" badge in the header
- Chat box at the bottom
- Example questions you can click
- AI responds in 2-5 seconds

### ❌ Problems? Here's What To Do:

**"npm install failed"**
→ Close terminal, reopen, try again
→ Make sure you have internet

**"Port 3001 already in use"**
→ Close other programs
→ Or restart your computer

**"Can't connect to localhost:3000"**
→ Make sure BOTH terminals are running
→ Wait 30 seconds after starting

**"Login doesn't work"**
→ Check you're using: `alice@aikb.com` / `admin123`
→ Make sure server terminal shows no errors

---

## 🎮 What Can You Do Now?

### 1. Ask Questions
Type anything in the chat box. Try:
- "What documents do you have?"
- "Tell me about security"
- "Who is the admin?"

### 2. Upload Your Own Files
1. Click the "Upload" button (if you see it)
2. Select a PDF or Word file
3. Wait 10-30 seconds
4. Ask questions about it!

### 3. Try Different Users
Logout and login with:
- `david@aikb.com` / `admin123` (Regular user)
- See what's different!

---

## 🛑 Stop the System

When you're done:

**Terminal 1 (Server):**
- Press `Ctrl + C`
- Type `Y` if asked

**Terminal 2 (Client):**
- Press `Ctrl + C`
- Type `Y` if asked

---

## 🚀 Next Steps

### Loved It? Want More?

**Read these guides in order:**

1. **GUIDE_FOR_BEGINNERS.md** - Explains how everything works
2. **USER_MANUAL.md** - All features explained
3. **DEPLOYMENT_GUIDE.md** - Setup for your team

### Want to Customize?

**Edit these files:**
- `server/.env` - Change settings
- `server/src/services/auth.service.ts` - Add users
- `client/src/app/page.tsx` - Change the look

---

## 🧠 What's Happening Behind the Scenes?

### When You Ask a Question:

1. **You type:** "What's the security policy?"
2. **Website sends** to server at `localhost:3001`
3. **Server searches** its database for similar documents
4. **AI reads** those documents
5. **AI writes** an answer
6. **Answer appears** on your screen

### All in 2-5 seconds!

---

## 📞 Still Stuck?

### Common Issues:

**"I don't see the chat box"**
→ Wait 30 more seconds
→ Refresh the page (F5)
→ Check terminal for red errors

**"AI says 'I don't know'"**
→ That's normal for demo mode
→ Upload real documents to fix this

**"Everything looks broken"**
→ Delete the `node_modules` folder
→ Run `npm install` again
→ Try from Step 3

---

## ✅ Success Checklist

- [ ] Two terminals running
- [ ] No red error messages
- [ ] Can access `http://localhost:3000`
- [ ] Can login with demo credentials
- [ ] Can ask a question
- [ ] Got an answer back

**If you checked all boxes: CONGRATULATIONS! 🎉**

---

## 🎯 What Makes This Special?

### Security
- Your data never leaves your computer
- Passwords are encrypted
- Only you can see your documents

### Speed
- Answers in 2-5 seconds
- Typing is instant
- No lag, no waiting

### Smart
- Understands natural questions
- Finds relevant documents
- Gives exact sources

---

## 📚 Glossary (Simple Terms)

**Server:** The brain that does all the work  
**Client:** The website you see  
**Terminal:** The black window where you type commands  
**npm:** A tool that installs things  
**AI:** The computer that reads and understands documents  

---

## 🎊 You're Ready!

**Remember:**
- This is **demo mode** - safe and easy
- No credit card needed
- No setup headaches
- Just follow the steps

**Enjoy your AI Knowledge Base!** 🚀

---

**Need more help?** See `GUIDE_FOR_BEGINNERS.md` for detailed explanations.