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

### 📂 Step 2: Connect your Google Drive

This tells the AI where your documents are.

1.  **Get the Hands**: Place your `google-key.json` file in the `server/data/` folder.
    - _Don't have one? See [full-setup.md](full-setup.md#step-a-get-your-google-key-) for a 1-minute guide._
2.  **Invite the AI**: Open `google-key.json`, copy the email address inside, and **Share** your Google Drive folder with that email.
3.  **Set the Target**: Copy the ID from your folder's URL and paste it into `.env`:
    ```env
    GOOGLE_DRIVE_FOLDER_ID=ABC_123_XYZ
    ```

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
