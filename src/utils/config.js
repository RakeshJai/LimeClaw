require('dotenv').config();

const config = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  AUTH_CHAT_ID: process.env.AUTH_CHAT_ID,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  DB_PATH: 'data/limeclaw.db'
};

if (!config.BOT_TOKEN) {
  console.warn('WARNING: BOT_TOKEN is missing from .env');
}

if (!config.AUTH_CHAT_ID) {
  console.warn('WARNING: AUTH_CHAT_ID is missing from .env');
}

module.exports = config;
