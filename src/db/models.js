const db = require('../db/database');

const taskModel = {
    create: (description, targetDir) => {
        const stmt = db.prepare('INSERT INTO tasks (description, target_dir) VALUES (?, ?)');
        const info = stmt.run(description, targetDir);
        return info.lastInsertRowid;
    },
    
    getById: (id) => {
        const stmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
        return stmt.get(id);
    },
    
    getNextQueued: () => {
        const stmt = db.prepare("SELECT * FROM tasks WHERE status = 'queued' ORDER BY priority DESC, id ASC LIMIT 1");
        return stmt.get();
    },

    getActiveTask: () => {
        const stmt = db.prepare("SELECT * FROM tasks WHERE status = 'running' LIMIT 1");
        return stmt.get();
    },

    getRateLimitedTasks: () => {
        const stmt = db.prepare("SELECT * FROM tasks WHERE status = 'rate_limited' ORDER BY priority DESC, id ASC");
        return stmt.all();
    },
    
    updateStatus: (id, status) => {
        const stmt = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(status, id);
    },

    updateEngine: (id, engine) => {
        const stmt = db.prepare('UPDATE tasks SET current_engine = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(engine, id);
    },

    updateDir: (id, newDir) => {
        const stmt = db.prepare('UPDATE tasks SET target_dir = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(newDir, id);
    },

    updatePhases: (id, phasesArray) => {
        const stmt = db.prepare('UPDATE tasks SET phases_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run(JSON.stringify(phasesArray), id);
    },

    addLog: (taskId, content, logType = 'stdout') => {
        const stmt = db.prepare('INSERT INTO logs (task_id, content, log_type) VALUES (?, ?, ?)');
        stmt.run(taskId, content, logType);
    },
    
    getLogs: (taskId, limit = 50) => {
        const stmt = db.prepare('SELECT * FROM logs WHERE task_id = ? ORDER BY id DESC LIMIT ?');
        return stmt.all(taskId, limit).reverse();
    },
    
    getAll: () => {
        const stmt = db.prepare('SELECT * FROM tasks ORDER BY id DESC');
        return stmt.all();
    }
};

module.exports = taskModel;
