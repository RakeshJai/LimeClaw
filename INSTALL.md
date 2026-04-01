# 🐧 Chromebook Linux Setup Guide

Complete step-by-step instructions to run LimeClaw on Chromebook Linux (Crostini/Debian).

---

## 1. Update System

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Install System Dependencies

```bash
# Build tools (required for better-sqlite3 native module)
sudo apt install -y build-essential python3 git curl

# SQLite (required for better-sqlite3)
sudo apt install -y libsqlite3-dev

# Chromium dependencies (required for playwright-chromium)
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libnspr4
```

## 3. Install Node.js (v20 LTS)

```bash
# Install nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Install Node.js v20
nvm install 20

# Verify
node --version
npm --version
```

## 4. Clone the Repository

```bash
cd ~
git clone https://github.com/RakeshJai/LimeClaw.git
cd LimeClaw
```

## 5. Install npm Dependencies

```bash
npm install
```

### All npm Packages Installed:

| Package | Version | Purpose |
|---------|---------|---------|
| telegraf | ^4.16.3 | Telegram bot framework |
| better-sqlite3 | ^12.8.0 | SQLite database |
| groq-sdk | ^1.1.2 | Groq LLM API |
| @slidev/cli | ^52.14.1 | Presentation generation |
| playwright-chromium | ^1.58.2 | Browser automation |
| node-cron | ^4.2.1 | Task scheduling |
| dotenv | ^17.3.1 | Environment variables |
| winston | ^3.19.0 | Logging |

## 6. Install Playwright Chromium

```bash
npx playwright install chromium
```

## 7. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your API keys
nano .env
```

Fill in your keys:
```
BOT_TOKEN=your_telegram_bot_token_here
AUTH_CHAT_ID=your_telegram_chat_id_here
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

## 8. Run the Bot

```bash
# Start directly
npm start

# Or with pm2 (recommended for background)
npm install -g pm2
npm run pm2

# View logs
pm2 logs limeclaw

# Stop
pm2 stop limeclaw
```

---

## Troubleshooting

### `better-sqlite3` fails to build
```bash
sudo apt install -y python3 make g++
npm rebuild better-sqlite3
```

### Playwright chromium not found
```bash
npx playwright install chromium
```

### Permission denied errors
```bash
sudo chown -R $USER:$USER ~/LimeClaw
```

### Node version issues
```bash
nvm use 20
```

---

## Quick Reference

| Command | Action |
|---------|--------|
| `npm start` | Start the bot |
| `npm run pm2` | Start with pm2 |
| `pm2 logs limeclaw` | View logs |
| `pm2 restart limeclaw` | Restart bot |
| `pm2 stop limeclaw` | Stop bot |
| `pm2 monit` | Monitor resources |
