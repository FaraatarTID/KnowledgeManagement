# 🌍 Production Deployment Guide: AIKB on the Web

This guide explains how to take the AIKB app from your computer and put it on the internet so your whole company can use it.

---

## 🤔 What You Need (The Basics)

To put a website on the internet, you need a **Server**.
A Server is just a computer that stays on 24/7.
We recommend using **DigitalOcean** or **AWS** or **Google Cloud**.

### Recommended Server Size

- **CPU**: 2 Cores
- **RAM**: 4GB or more
- **OS**: Ubuntu 22.04 LTS

---

## 🛠️ Step 1: Prepare the Server

Log into your server via SSH (your IT team knows how to do this).
Run these commands one by one to install the necessary software:

```bash
# 1. Update the system
sudo apt update && sudo apt upgrade -y

# 2. Install Docker (The engine that runs the app)
sudo apt install docker.io docker-compose -y

# 3. Start Docker
sudo systemctl enable --now docker

# 4. Install Nginx (The "Traffic Cop" for the internet)
sudo apt install nginx -y
```

---

## 📦 Step 2: Upload the App

You need to copy the files from your computer to the server.
You can use a tool like **FileZilla** or the command line.

**What to copy:**

- Folder: `server`
- Folder: `client`
- File: `docker-compose.yml`
- File: `nginx.conf.example`

_(Do NOT copy `node_modules` folders, they are huge and unneeded)_

---

## 🚀 Step 3: Launch!

1.  **Create your secret `.env` files**:
    On the server, make sure you create the `.env` file in the `server` folder just like you did on your laptop. **This is critical.** The app won't start without secrets.

2.  **Start the engines**:
    Run this command in the folder where you uploaded the files:

    ```bash
    sudo docker-compose up -d --build
    ```

    - `up`: Start
    - `-d`: Detached (Run in background)
    - `--build`: Build the app from scratch

3.  **Check if it's running**:
    ```bash
    sudo docker ps
    ```
    You should see two items listed: `aikb-client` and `aikb-server`.

---

## 🌐 Step 4: Connect the Domain (www.yourcompany.com)

1.  **Stop Nginx for a second**:
    ```bash
    sudo systemctl stop nginx
    ```
2.  **Edit the Config**:
    We provided a template. Copy it to the right place:
    ```bash
    sudo cp nginx.conf.example /etc/nginx/sites-available/aikb
    ```
3.  **Link it**:
    ```bash
    sudo ln -s /etc/nginx/sites-available/aikb /etc/nginx/sites-enabled/
    ```
4.  **Restart Nginx**:
    ```bash
    sudo systemctl restart nginx
    ```

---

## 🔒 Step 5: Make it Secure (SSL)

You want that green "Lock" icon in the browser (HTTPS).
Run these commands to get it for free (using Certbot):

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d your-domain.com
```

Follow the prompts. When it finishes, your site is live and secure!

---

## 🚨 Troubleshooting

- **"502 Bad Gateway"**: This means Nginx works, but Docker is crashed. Check Docker logs: `sudo docker logs aikb-server`.
- **"Connection Refused"**: Check your firewall (UFW). Allow ports 80 and 443.
