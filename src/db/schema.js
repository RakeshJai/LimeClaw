const db = require('./database');
const logger = require('../utils/logger');

function initSchema() {
    logger.info('Initializing database schema...');
    
    // Add columns dynamically to avoid migration errors if recreating
    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                description TEXT NOT NULL,
                target_dir TEXT NOT NULL,
                status TEXT DEFAULT 'queued',
                current_engine TEXT DEFAULT 'opencode',
                phases_json TEXT DEFAULT '[]',
                priority INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER NOT NULL REFERENCES tasks(id),
                content TEXT NOT NULL,
                log_type TEXT DEFAULT 'stdout',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversation_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Migrations — silently ignored if column already exists
        try { db.exec("ALTER TABLE tasks ADD COLUMN phases_json TEXT DEFAULT '[]';"); } catch(e){}
        try { db.exec("ALTER TABLE tasks ADD COLUMN priority INTEGER DEFAULT 0;"); } catch(e){}
        // Index for fast per-chat memory lookup
        try { db.exec("CREATE INDEX IF NOT EXISTS idx_memory_chat ON conversation_memory(chat_id, id);"); } catch(e){}
        // Migrate old engine values to opencode (covers gemini, mimo, antigravity, NULL)
        // Note: models.js explicitly sets current_engine on insert, so the column default is not relied upon
        try { db.exec("UPDATE tasks SET current_engine = 'opencode' WHERE current_engine IS NULL OR current_engine != 'opencode'"); } catch(e){}
    } catch (err) {
        logger.error(`Schema error: ${err.message}`);
    }
    
    logger.info('Database schema initialized.');
}

module.exports = { initSchema };
