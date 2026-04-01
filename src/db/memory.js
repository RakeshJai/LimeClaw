const db = require('./database');

// Max number of messages to keep per chat (sliding window)
const MAX_MEMORY = 20;

const memoryModel = {
    /**
     * Append a message to a chat's history.
     * @param {string|number} chatId
     * @param {'user'|'assistant'|'system'} role
     * @param {string} content
     */
    append(chatId, role, content) {
        const stmt = db.prepare('INSERT INTO conversation_memory (chat_id, role, content) VALUES (?, ?, ?)');
        stmt.run(String(chatId), role, content);

        // Prune oldest messages beyond the window
        const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM conversation_memory WHERE chat_id = ?');
        const { cnt } = countStmt.get(String(chatId));
        if (cnt > MAX_MEMORY) {
            const deleteStmt = db.prepare(`
                DELETE FROM conversation_memory
                WHERE id IN (
                    SELECT id FROM conversation_memory
                    WHERE chat_id = ?
                    ORDER BY id ASC
                    LIMIT ?
                )
            `);
            deleteStmt.run(String(chatId), cnt - MAX_MEMORY);
        }
    },

    /**
     * Get the recent history as an array of { role, content } objects.
     * Optionally prepend a system prompt.
     * @param {string|number} chatId
     * @param {string} [systemPrompt]
     * @returns {{ role: string, content: string }[]}
     */
    getHistory(chatId, systemPrompt = null) {
        const stmt = db.prepare(
            'SELECT role, content FROM conversation_memory WHERE chat_id = ? ORDER BY id ASC'
        );
        const rows = stmt.all(String(chatId));
        if (systemPrompt) {
            return [{ role: 'system', content: systemPrompt }, ...rows];
        }
        return rows;
    },

    /**
     * Clear all memory for a chat (e.g. /clear command or explicit wipe).
     * @param {string|number} chatId
     */
    clear(chatId) {
        const stmt = db.prepare('DELETE FROM conversation_memory WHERE chat_id = ?');
        stmt.run(String(chatId));
    },

    /**
     * Return the number of messages stored for a chat.
     * @param {string|number} chatId
     */
    count(chatId) {
        const stmt = db.prepare('SELECT COUNT(*) as cnt FROM conversation_memory WHERE chat_id = ?');
        return stmt.get(String(chatId))?.cnt ?? 0;
    }
};

module.exports = memoryModel;
