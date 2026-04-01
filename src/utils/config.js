require('dotenv').config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  AUTH_CHAT_ID: process.env.AUTH_CHAT_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GEMINI_CLI_PATH: process.env.GEMINI_CLI_PATH || 'C:\\Users\\rakes\\AppData\\Roaming\\npm\\node_modules\\@google\\gemini-cli\\dist\\index.js',
  MIMO_API_KEY: process.env.MIMO_API_KEY,
  MIMO_BASE_URL: process.env.MIMO_BASE_URL || 'https://openrouter.ai/api/v1',
  MIMO_MODEL_ID: process.env.MIMO_MODEL_ID || 'opencode/mimo-v2-pro-free',
  DB_PATH: 'data/limeclaw.db'
};

if (!config.BOT_TOKEN) {
  console.warn('WARNING: BOT_TOKEN is missing from .env');
}

if (!config.AUTH_CHAT_ID) {
  console.warn('WARNING: AUTH_CHAT_ID is missing from .env');
}

if (!config.MIMO_API_KEY) {
  console.warn('WARNING: MIMO_API_KEY is missing from .env');
}

module.exports = config;
