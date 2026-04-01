const Database = require('better-sqlite3');
const path = require('path');
const config = require('../utils/config');
const logger = require('../utils/logger');

// Ensure data directory exists
const fs = require('fs');
const dir = path.dirname(config.DB_PATH);
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(config.DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

process.on('exit', () => db.close());
process.on('SIGHUP', () => process.exit(128 + 1));
process.on('SIGINT', () => process.exit(128 + 2));
process.on('SIGTERM', () => process.exit(128 + 15));

module.exports = db;
