# 📘 AIKB User Guide - Complete Instructions

**Version:** 2.1.0 | **Last Updated:** February 1, 2026 | **Status:** ✅ Production Ready

> Complete guide for using the AI Knowledge Base system with secure document management, intelligent search, and reliable operations.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Login & Authentication](#login--authentication)
3. [Core Features](#core-features)
4. [Document Management](#document-management)
5. [Using AI Chat](#using-ai-chat)
6. [Search & Discovery](#search--discovery)
7. [User Roles & Permissions](#user-roles--permissions)
8. [Security & Best Practices](#security--best-practices)
9. [Troubleshooting](#troubleshooting)
10. [Advanced Features](#advanced-features)

---

## Getting Started

### First Time Setup (5 Minutes)

**What You'll Need:**

- Email address (provided by your administrator)
- Password (provided or set during account creation)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Stable internet connection

**Access the System:**

1. Open: **http://localhost:3000** (or your organization's domain)
2. Login with your email and password
3. Accept the security verification if prompted
4. Review and accept the terms of service
5. You're ready to use AIKB!

> [!TIP]
> **Administrators:** See the [Admin Setup Guide](../admin/full-setup.md) for setup details, including the required `JWT_SECRET` hex format and the standard Google key path (`GCP_KEY_FILE=data/google-key.json`).

### Dashboard Overview

When you login, you'll see:

| Section              | Description                           |
| -------------------- | ------------------------------------- |
| **Search Bar**       | Quick search for documents and topics |
| **Inbox**            | Notifications and shared documents    |
| **Recent Documents** | Documents you've recently accessed    |
| **AI Chat**          | Chat interface to ask questions       |
| **Navigation**       | Menu to access all features           |

---

## Login & Authentication

### Creating Your Account

Your administrator will either:

- **Option 1:** Create your account and send you a temporary password
  - You'll be asked to change it on first login
- **Option 2:** Send you an invitation link
  - Click the link and set your password

### Logging In

1. Go to **http://localhost:3000**
2. Enter your **Email Address**
3. Enter your **Password**
4. Click **"ورود"** (Login) button
5. Wait for authentication (usually < 5 seconds)

**Success indicators:**

- ✅ Dashboard loads
- ✅ Your name appears in top-right corner
- ✅ You can see documents

### Password & Security

**Strong Password Requirements:**

- Minimum 12 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one number (0-9)
- At least one special character (!@#$%^&\*)

**Password Reset:**

1. Click "Forgot Password?" on login page
2. Enter your email address
3. Check your email for reset link
4. Click the link (valid for 24 hours)
5. Set your new password
6. Login with new password

### Two-Factor Authentication (2FA)

If 2FA is enabled by your organization:

1. After entering password, you'll see 2FA prompt
2. Open your authenticator app (Google Authenticator, Microsoft Authenticator, etc.)
3. Enter the 6-digit code
4. Click "Verify"

**Lost your 2FA device?**

- Contact your IT administrator immediately
- Provide identity verification
- Administrator can reset 2FA

### Account Lockout

After **5 failed login attempts**, your account will lock for **15 minutes**.

**If locked out:**

1. Wait 15 minutes
2. Try logging in again
3. Still locked? Contact IT administrator

---

## Core Features

### 1. Document Management

#### Upload a Document

**Step 1: Start Upload**

```
Click "افزودن سند" (Add Document) button
- Usually in top navigation
- Or accessible from your dashboard
```

**Step 2: Fill Document Information**

- **Title:** Give your document a clear name
  - Example: "Q4 2025 Financial Report"
  - Use keywords others might search for
- **Category:** Select from available categories
  - HR (Human Resources)
  - Finance
  - IT (Information Technology)
  - Operations
  - Or custom categories
- **Description (Optional):** Add more details
  - 1-2 sentences about content
  - Helps with search results
- **Upload File:** Click "Choose File" to select
  - Supported formats: PDF, DOCX, TXT, PNG, JPG
  - Maximum file size: 100 MB
  - Multiple files: Upload one at a time

**Step 3: Review & Save**

```
Click "ذخیره سند" (Save Document)
Wait for confirmation message
Document now searchable and available to authorized users
```

**Upload Tips:**

- ✅ Use descriptive titles
- ✅ Add category for better organization
- ✅ Upload one file at a time for large files
- ✅ Check file permissions before uploading
- ❌ Don't upload confidential without checking access settings

#### View Your Documents

**Access Documents:**

1. Click **"اسناد"** (Documents) in navigation
2. You'll see all documents you can access
3. Sort by:
   - Date (newest first)
   - Title (alphabetical)
   - Category (grouped)

**Document Actions:**

- **Click document** → View full content
- **Search icon** → Find specific document
- **Share icon** → Share with colleagues
- **Delete icon** → Remove document (if you own it)

#### Search Documents

**Quick Search:**

```
1. Click search bar at top
2. Type keyword or phrase
3. Results appear instantly
4. Click result to view document
```

**Advanced Search:**

```
1. Go to Documents → Advanced Search
2. Filter by:
   - Category
   - Upload date range
   - Owner/Creator
   - File type
   - Shared status
3. Click "Search"
```

**Search Tips:**

- Use exact phrases: `"quarterly report"` (with quotes)
- Use wildcards: `budget*` finds budget, budgeting, etc.
- Use operators:
  - AND: `project AND timeline`
  - OR: `invoice OR receipt`
  - NOT: `NOT draft`

---

### 2. AI Chat & Q&A

#### Ask Questions About Documents

The AI Chat lets you ask questions about your documents and get instant, verified answers.

**How It Works:**

1. Click **AI Chat** tab (usually on left sidebar)
2. Type your question in the message box
3. Press **Enter** or click **Send** (ارسال)
4. Wait 2-10 seconds for response
5. Read the answer with:
   - **Confidence level** (High/Medium/Low)
   - **Direct quotes** from documents
   - **Source references** (which document)

**Example Questions:**

- "What is the Q4 budget allocation?"
- "Who is the project manager for XYZ project?"
- "When is the company meeting scheduled?"
- "What are the system requirements?"
- "Find me all documents about payroll"

#### Understanding AI Responses

**Confidence Levels:**

| Level         | Meaning                                 | Action                            |
| ------------- | --------------------------------------- | --------------------------------- |
| **High ✅**   | AI found clear answer in documents      | Trust the response                |
| **Medium ⚠️** | AI has answer but with some uncertainty | Verify with original document     |
| **Low ❌**    | AI has limited confidence               | Check original documents yourself |

**Source Quotes:**

- AI provides exact quotes from your documents
- Quotes are highlighted in blue
- Click quote to jump to source document
- Verify quote matches your documents

**Hallucination Detection:**

- If AI makes up information, it will be flagged
- System checks all quotes for accuracy
- You're notified if verification fails
- Always verify critical information

#### Chat History

**Accessing Previous Chats:**

1. Click **"Chat Threads"** (if available)
2. See all your previous conversations
3. Click to continue a conversation
4. Or start a new chat

**Organizing Chats:**

- Pin important chats
- Archive old chats
- Search chat history
- Export conversation (if enabled)

---

### 3. Search & Discovery

#### Full-Text Search

**Basic Search:**

```
1. Use search bar at top of page
2. Type keywords
3. Results include:
   - Documents with matching content
   - Preview of matching section
   - Relevance score (how well it matches)
```

**Search Results:**

- **Title** - Document name
- **Category** - Type of document
- **Excerpt** - Preview of matching content
- **Relevance** - Match quality (%)

#### Vector Search (AI-Powered)

This advanced search understands meaning, not just keywords:

**How It's Different:**

- **Traditional:** Search "car" finds "car", "auto", "vehicle" only if written
- **Vector Search:** Understands "red automobile" matches question about cars

**Using Vector Search:**

```
1. Ask a question in natural language
2. AI finds documents with similar meaning
3. Even if words are different
4. Great for conceptual searches
```

#### Saved Searches

**Create a Saved Search:**

1. Perform a search
2. Click "Save Search" button
3. Give it a name (e.g., "Q4 Reports")
4. Click "Save"

**Using Saved Searches:**

- Quick access from dashboard
- Auto-run when clicked
- Edit or delete anytime

---

## Document Management

### Sharing Documents

#### Share with Colleagues

**Step 1: Select Document**

```
Click on document
Look for "Share" button
```

**Step 2: Choose Recipients**

```
Enter colleague's email address(es)
Or select from suggested list
```

**Step 3: Set Permissions**

| Permission  | Can Read | Can Edit | Can Delete | Can Share |
| ----------- | -------- | -------- | ---------- | --------- |
| **Viewer**  | ✅       | ❌       | ❌         | ❌        |
| **Editor**  | ✅       | ✅       | ❌         | ❌        |
| **Manager** | ✅       | ✅       | ✅         | ✅        |

**Step 4: Send**

```
Add optional message
Click "Share"
Colleague receives notification
```

#### Document Permissions

**Owner (You):**

- Always can: Read, Edit, Delete, Share, Change Permissions
- Can revoke access anytime

**Department (HR/Finance/etc):**

- Set by administrator
- Usually: Can Read
- Some may: Can Edit

**Organization (Everyone):**

- If marked "Public"
- Usually: Can Read only
- Cannot Edit or Delete

### Version History

**Viewing Document History:**

1. Open document
2. Click **"Version History"** (clock icon)
3. See all versions:
   - Date/time created
   - Who made changes
   - Change summary

**Restoring Previous Version:**

1. Click version you want to restore
2. Click **"Restore This Version"**
3. Confirm action
4. Current version is replaced

---

## Using AI Chat

### Starting a Conversation

**Begin Chat:**

1. Click **"AI Chat"** in sidebar
2. See conversation history (if any)
3. Type your question at bottom
4. Press Enter or click Send (ارسال)

### Chat Types

**Information Questions:**

```
"What is the company vacation policy?"
"When is the next board meeting?"
"How do I submit an expense report?"
```

**Analysis Questions:**

```
"Summarize the quarterly results"
"Compare Q3 and Q4 performance"
"List all action items from the meeting"
```

**Definition Questions:**

```
"What is our product XYZ?"
"Explain the new approval process"
"Define AIKB system"
```

### Following Up

**Ask Follow-Up Questions:**

- Reference previous answer: "Tell me more about that"
- Ask differently: "Can you explain with an example?"
- Explore deeper: "What else should I know about this?"

**Example Conversation:**

```
User: "What is our return policy?"
AI:   "Based on the policy document..."

User: "Can you provide an example?"
AI:   "For example, if a customer..."

User: "What about after 30 days?"
AI:   "After 30 days, items are..."
```

---

## User Roles & Permissions

### Role Comparison

| Feature              | Viewer | Editor | Manager | Admin |
| -------------------- | ------ | ------ | ------- | ----- |
| **Use AI Chat**      | ✅     | ✅     | ✅      | ✅    |
| **View Dashboard**   | ❌     | ❌     | ✅      | ✅    |
| **Document Library** | ❌     | ❌     | ❌      | ✅    |
| **Upload Documents** | ❌     | ❌     | ❌      | ✅    |
| **Access Control**   | ❌     | ❌     | ❌      | ✅    |
| **System Settings**  | ❌     | ❌     | ❌      | ✅    |

> [!NOTE]
> **Enterprise Governance**: To ensure a "Strict Deny" security model, only users with the **ADMIN** role can manage the document library or system users. Managers are provided with a high-level operational overview via the Dashboard.

### Requesting Role Changes

**Need More Permissions?**

1. Contact your **Department Manager**
2. Provide business justification
3. Manager reviews and approves/denies
4. If approved, your role is updated
5. Changes take effect immediately

**Common Role Change Requests:**

- Viewer → Editor: Need to upload documents
- Editor → Manager: Managing team or department
- Manager → Admin: System administration needed

---

## Security & Best Practices

### Password Security

**Keep Your Password Safe:**

- ✅ Use strong password (12+ characters)
- ✅ Change password every 90 days
- ✅ Never share with anyone
- ✅ Use different passwords for different systems
- ❌ Don't write password on sticky note
- ❌ Don't use obvious passwords (123456, password)
- ❌ Don't reuse old passwords

**Changing Your Password:**

1. Click your profile (top-right)
2. Click **"Change Password"**
3. Enter current password
4. Enter new password (twice)
5. Click **"Update"**

### Document Sensitivity

**Classify Documents Properly:**

```
Public:      No confidentiality needed
Internal:    For employees only
Sensitive:   Limited access required
Confidential: Management/Legal only
```

**Check Before Uploading:**

- ✅ No customer data
- ✅ No financial details (if marked public)
- ✅ No passwords or API keys
- ✅ No personal information

### Secure Browsing

**Best Practices:**

- ✅ Always use HTTPS (lock icon in address bar)
- ✅ Log out when done (top-right menu)
- ✅ Close tab/window when done
- ✅ Don't use public WiFi for sensitive info
- ✅ Keep browser updated
- ✅ Use strong passwords
- ❌ Don't share login credentials
- ❌ Don't use browser's "Remember Password"

---

## Troubleshooting

### Login Issues

**Problem: "Invalid Email or Password"**

```
Solution:
1. Verify CAPS LOCK is off
2. Check email spelling carefully
3. Try password reset (Forgot Password?)
4. Clear browser cache and cookies
5. Try different browser
6. Contact IT if still failing
```

**Problem: "Account Locked"**

```
Solution:
1. Wait 15 minutes
2. Try logging in again
3. If still locked, contact IT
IT can: Check logs, verify identity, unlock account
```

**Problem: "Too Many Login Attempts"**

```
Solution:
1. Wait 1 hour
2. Try again
3. Ensure correct credentials
4. Contact IT if repeated
```

### Document Issues

**Problem: "Cannot Upload Document"**

```
Solution:
1. Check file size (max 100 MB)
2. Check file format (PDF, DOCX, TXT, PNG, JPG)
3. Check upload folder permissions
4. Try different browser
5. Contact IT if persists
```

**Problem: "Document Appears Blank"**

```
Solution:
1. Wait for document to fully load (progress bar)
2. Refresh browser (F5 or Ctrl+R)
3. Close and reopen document
4. Try different browser
5. Check document format compatibility
```

**Problem: "Cannot Find Document"**

```
Solution:
1. Check you have access to document
2. Try different search terms
3. Check document category filters
4. Ask owner/creator to re-share
5. Check if document was deleted
```

### Chat Issues

**Problem: "AI Not Connected"**

```
This means: AI configuration is missing in your `.env` file.
Solution:
1. Use the "Easy Mode" (Option 1 in Setup Guide).
2. Get a free Gemini API Key from Google AI Studio.
3. Add it to GOOGLE_API_KEY in your server/.env file.
4. Restart the app. AI answers will now work instantly.
```

**Problem: "Chat Takes Too Long"**

```
Solution:
1. Check internet connection
2. Try asking simpler question
3. Ensure documents are uploaded
4. Refresh browser
5. Restart browser if very slow
```

**Problem: "AI Gave Wrong Answer"**

```
Solution:
1. Check "Confidence Level"
2. If Medium/Low, verify original document
3. Try asking differently
4. Report issue to administrator (if consistently wrong)
5. Use AI response as starting point, verify details
```

## Advanced Features

### Exporting Data

**Export Document:**

1. Open document
2. Click menu (⋮) button
3. Click **"Export As"**
4. Choose format: PDF, DOCX, TXT
5. Download starts

**Export Chat:**

1. In chat, click menu button
2. Click **"Export Conversation"**
3. Choose format: PDF, TXT, JSON
4. Download starts

### Cloud Backup (Admins Only)

If your system is configured for **Local Mode**, you will see a **"☁️ Cloud Backup"** button in the header.

**To Backup Your Data:**

1. Click the **"پشتیبان‌گیری ابری"** (Cloud Backup) button.
2. The system will create a snapshot of your `vectors.db` (containing users, history, and metadata).
3. The snapshot is uploaded to the designated Google Drive folder.
4. Use this before migrating servers or as a daily safety measure.

> [!NOTE]
> If you are using Supabase, your data is already stored in the cloud, and this button may not be necessary or visible.

### Bulk Actions

**Select Multiple Documents:**

1. Click checkbox next to first document
2. Hold Ctrl and click other documents
3. Choose action from menu:
   - Delete (if you own them)
   - Share with multiple people
   - Download as ZIP
   - Move to folder

### Collaboration

**Co-editing (if enabled):**

1. Open document
2. Invite others to edit (Share button)
3. All edits show in real-time
4. See who's editing in top-right
5. Comments appear as bubbles

**Comments:**

1. Highlight text
2. Click **"Add Comment"**
3. Type comment
4. @ mention colleagues
5. They receive notification

---

## Tips & Tricks

### Keyboard Shortcuts

| Shortcut        | Action              |
| --------------- | ------------------- |
| **Ctrl+F**      | Find in document    |
| **Ctrl+S**      | Save document       |
| **Ctrl+A**      | Select all text     |
| **Ctrl+C**      | Copy                |
| **Ctrl+V**      | Paste               |
| **Enter**       | Send chat message   |
| **Shift+Enter** | New line in message |

### Productivity Tips

**Search Efficiently:**

- Use exact phrases with quotes: `"project timeline"`
- Use wildcards: `report*` finds report, reports, reporting
- Combine terms: `project AND timeline AND 2025`

**Organize Documents:**

- Use consistent naming: `[Date] Subject` e.g., `[2025-02] Budget Report`
- Add descriptions when uploading
- Use appropriate categories
- Share strategically

**Chat Effectively:**

- Ask specific questions
- Include context if needed
- Follow up naturally
- Verify important information

---

## Getting Help

### Support Options

| Issue                 | Contact        | Response Time |
| --------------------- | -------------- | ------------- |
| **Login Problem**     | IT Help Desk   | < 1 hour      |
| **Cannot Access Doc** | Document Owner | < 24 hours    |
| **AI Not Working**    | IT Help Desk   | < 2 hours     |
| **General Question**  | Team Lead      | < 1 hour      |
| **Bug Report**        | IT Help Desk   | < 24 hours    |

### Self-Help Resources

- [README.md](README.md) - System overview
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Command reference
- [DEPLOYMENT_READY.md](DEPLOYMENT_READY.md) - For administrators
- [server/docs/RUNBOOK\_\*.md](server/docs/) - Operational guides

---

## System Requirements

**To Use AIKB, You Need:**

| Requirement  | Minimum     | Recommended                  |
| ------------ | ----------- | ---------------------------- |
| **OS**       | Windows 7+  | Windows 10+                  |
| **Browser**  | Chrome 60+  | Chrome/Firefox/Safari latest |
| **Internet** | 2 Mbps      | 5+ Mbps                      |
| **Screen**   | 1024x768    | 1920x1080                    |
| **RAM**      | 2 GB        | 4+ GB                        |
| **Storage**  | 100 MB free | 500 MB free                  |

---

## FAQ - Frequently Asked Questions

**Q: How often is my data backed up?**  
A: Automatically backed up hourly. Contact IT for backup restoration.

**Q: Can I access AIKB from mobile?**  
A: Yes, responsive design works on tablets. Full functionality on desktop recommended.

**Q: How long are chats saved?**  
A: Indefinitely. Chats are archived and searchable.

**Q: Can I download all my documents?**  
A: Yes, export individually or select multiple for ZIP download.

**Q: What happens if I forget my password?**  
A: Use "Forgot Password?" on login page. Link valid for 24 hours.

**Q: Who can see my documents?**  
A: Only people you share with + your department (per permissions).

**Q: What file formats are supported?**  
A: PDF, DOCX, TXT, PNG, JPG. Size limit: 100 MB per file.

---

**Version:** 2.1.0  
**Last Updated:** February 1, 2026  
**Status:** ✅ Production Ready  
**Support:** support@aikb.example.com

---
