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

- [ ] **Unified Login**: Use the new email/password form for both roles.
- [ ] **Login as Admin**: Enter `alice@aikb.com` / `admin123`. Verify access to Admin Console.
- [ ] **Logout**: Click Profile > Logout. Should return to Login screen.
- [ ] **Login as Viewer**: Enter `david@aikb.com` / `admin123`. Verify limited view (Chat only).

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
  - **New Requirement**: Does it include at least one **Direct Quote** from the document?
- [ ] **Context Test**: Ask a follow-up.
  - _Example: "Does this apply to contractors too?"_ (It should remember previous context).

### 4. Precision & Grounding (Anti-Hallucination)

- [ ] **Negative Retrieval Test**: Ask a question that you **know** is not in any of your uploaded docs.
  - _Example: "What is our company's policy on interplanetary travel?"_
  - **Verify Resilience**: Does the AI correctly state it doesn't know? (It should NOT make up an answer).
- [ ] **Literal Test**: Ask a complex question and check if the AI "guesses" intent.
  - _Example: "What does the CEO think about the new budget?"_ (If the doc only lists budget numbers, the AI should refuse to comment on the CEO's "thoughts").
- [ ] **Conflict Test**: Upload two docs with slightly different dates for a deadline. Ask the AI: "When is the deadline?"
  - **Verify Report**: Does it mention that there is conflicting information between the two files?

### 5. Smart Organization (The "Automation" Test)

- [ ] **Upload File with Keyword**:
  - Upload a file named `security_test_1.pdf`.
  - Go to **Library**.
- [ ] **Verify Department**: Does the system automatically assign it to the **IT** department?
- [ ] **Upload with YAML (Advanced)**:
  - Upload a `.txt` file starting with `--- department: Finance ---`.
  - Verify the **Finance** department is assigned.

### 6. Security Clearance (Tiered Access)

- [ ] **Restricted Document Test**:
  - As Admin, change a document's sensitivity to `RESTRICTED`.
  - Log in as an **Employee (Viewer)** in the same department.
  - Ask the Chat about that document.
- [ ] **Verify Denial**: Does the AI refuse or state it has no information? (It should not "see" the restricted file).
- [ ] **Elevated Access**:
  - Change the Employee's role to **Manager**.
  - Ask the Chat again.
- [ ] **Verify Access**: Does the AI now answer correctly?

### 7. User Management (Admin Only)

- [ ] **Navigate**: In Admin Console, go to **Access Control**.
- [ ] **Create User**: Click **Add User**.
- [ ] **Form**: Create a test user: `test@aikb.com` / `pass123` / Role: `VIEWER`.
- [ ] **Verify Login**: Log out and try to log in with the new `test@aikb.com` account.
- [ ] **Verify Permissions**: Verify the new user can Chat but NOT access the Admin Console.

### 8. Security & Permissions

- [ ] **Viewer Upload Block**:
  - Log in as **David (Viewer)**.
  - Try to find the "Add Resource" button. (It should be missing or disabled).
  - If you try to access `http://localhost:3000/admin`, you should be redirected or blocked.

### 9. Drive Sync (Optional)

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
