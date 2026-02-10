# ⚡ AIKB Quick Setup Cheat Sheet (Easy Mode)

Follow these 3 simple steps to get your AI system running in less than 5 minutes. No coding or cloud engineering required.

---

### 🔑 Step 1: Get your Gemini AI Key

This is the "Brain" of the system.

1.  Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)**.
2.  Click **"Create API key"**.
3.  Copy that key and paste it into your `.env` file like this:
    ```env
    GOOGLE_API_KEY=your_key_here
    VECTOR_STORE_MODE=LOCAL
    ```

---

> [!NOTE]
> Easy Mode can auto-generate a temporary `JWT_SECRET` if you leave it blank, but logins will reset after each server restart. For stable sessions, set a fixed `JWT_SECRET` in `server/.env`.

### 📂 Step 2: Connect your Google Drive

This tells the AI where your documents are.

1.  **Get your Key**: Obtain your `google-key.json` and place it in the `server/` folder.
2.  **Invite the AI**: Share your Drive folder with the `client_email` found inside the JSON.
3.  **Update Config**: Set `GCP_KEY_FILE` and `GOOGLE_DRIVE_FOLDER_ID` in your `.env`.

> [!TIP]
> **Need more help?** For detailed, click-by-click instructions on getting keys and sharing folders, see **[Part 2 of the Full Setup Guide](full-setup.md#☁️-part-2-connecting-google-drive-the-knowledge-base)**.

---

### 🚀 Step 3: Launch

1.  Double-click **`run_app.bat`**.
2.  Open **`http://localhost:3000`** in Chrome or Edge.
3.  Log in with your Admin email and password.

---

### 💡 Which Mode am I using?

| Feature           | **Easy Mode** (Default) | **Enterprise Mode** |
| :---------------- | :---------------------- | :------------------ |
| **Setup Time**    | 5 Minutes               | 1 Hour              |
| **GCP Required?** | No                      | Yes (Vertex AI)     |
| **Best For**      | Everyone                | Advanced IT Teams   |

**Need more detail?** Read the full [full-setup.md](full-setup.md).
