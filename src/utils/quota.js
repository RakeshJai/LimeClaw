const { exec } = require('child_process');
const Groq = require('groq-sdk');
const config = require('./config');
const logger = require('./logger');

let groq;
if (config.GROQ_API_KEY) {
    groq = new Groq({ apiKey: config.GROQ_API_KEY });
}

// ─────────────────────────────────────────────
// Usage Tracking (real counts from DB logs)
// ─────────────────────────────────────────────

/**
 * Count log entries for a given engine today (UTC day).
 * Uses the logs table which records every CLI invocation output.
 */
function getDailyUsage() {
    try {
        const db = require('../db/database');
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        // Count distinct OpenCode task runs today
        const openCodeRuns = db.prepare(`
            SELECT COUNT(DISTINCT t.id) as cnt
            FROM tasks t
            JOIN logs l ON l.task_id = t.id
            WHERE date(l.created_at) = ?
              AND l.log_type = 'system'
              AND l.content LIKE '%Starting with OpenCode%'
        `).get(today);

        // Count Groq conversation messages today
        const groqMessages = db.prepare(`
            SELECT COUNT(*) as cnt
            FROM conversation_memory
            WHERE role = 'user'
              AND date(created_at) = ?
        `).get(today);

        return {
            groq: groqMessages?.cnt ?? 0,
            opencode: openCodeRuns?.cnt ?? 0,
        };
    } catch (e) {
        return { groq: 0, opencode: 0 };
    }
}

// ─────────────────────────────────────────────
// Progress Bar Renderer
// ─────────────────────────────────────────────

/**
 * Render a Telegram-friendly progress bar.
 * @param {number} used - Amount used
 * @param {number} limit - Total limit
 * @param {number} [segments=10] - Bar width
 */
function renderBar(used, limit, segments = 10) {
    const ratio = limit > 0 ? Math.min(1, used / limit) : 0;
    const filled = ratio <= 0 ? 0 : Math.max(1, Math.round(ratio * segments));
    let bar = '';
    for (let i = 0; i < segments; i++) {
        bar += i < filled ? '▰' : '▱';
    }
    const pct = Math.round(ratio * 100);
    return { bar, pct, ratio };
}

/**
 * Format a time-until-reset string based on the next midnight CT.
 */
function timeUntilMidnight() {
    const now = new Date();
    // Convert to CT (UTC-5 or UTC-6)
    const ct = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const reset = new Date(ct);
    reset.setDate(ct.getDate() + 1);
    reset.setHours(0, 0, 0, 0);
    const ms = reset - ct;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
}

// ─────────────────────────────────────────────
// Live Engine Checks
// ─────────────────────────────────────────────

/**
 * Check Groq API — makes a tiny real call to confirm it's alive.
 * Groq returns rate-limit headers we can read.
 */
async function checkGroqQuota() {
    if (!groq) return { status: '❌ No API key configured', online: false };

    try {
        await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'hi' }],
            model: 'llama-3.3-70b-versatile',
            max_tokens: 1,
        });
        return { status: '✅ Online', online: true };
    } catch (err) {
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('429') || msg.includes('rate limit')) {
            const m = msg.match(/try again in ([\d.]+[smh])/i);
            return { status: '⚠️ Rate Limited', resetIn: m ? m[1] : 'soon', online: false };
        }
        return { status: `❌ Error`, detail: err.message?.substring(0, 80), online: false };
    }
}

/**
 * Check OpenCode CLI availability — tries to run a simple prompt.
 */
function checkOpenCodeAvailability() {
    return new Promise((resolve) => {
        exec('opencode run "say ok"', { timeout: 20000, shell: true }, (err, stdout, stderr) => {
            const c = `${stdout} ${stderr} ${err?.message ?? ''}`.toLowerCase();

            if (c.includes('not recognized') || c.includes('command not found') || c.includes('enoent')) {
                return resolve({ status: '❌ CLI not found', note: 'Install opencode: npm install -g opencode', online: false });
            }
            if (c.includes('rate limit') || c.includes('429') || c.includes('quota exceeded')) {
                return resolve({ status: '⚠️ Rate Limited', online: false });
            }
            if (c.includes('not logged in') || c.includes('unauthenticated') || c.includes('sign in')) {
                return resolve({ status: '⚠️ Not Authenticated', note: 'Run opencode to sign in', online: false });
            }
            return resolve({ status: '✅ Online', online: true });
        });
    });
}

// ─────────────────────────────────────────────
// Full Report
// ─────────────────────────────────────────────

async function getFullQuotaReport() {
    logger.info('Running quota checks...');

    const [groqResult, openCodeResult, usage] = await Promise.all([
        checkGroqQuota(),
        checkOpenCodeAvailability(),
        Promise.resolve(getDailyUsage()),
    ]);

    const now = new Date().toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
    });
    const resetIn = timeUntilMidnight();

    const LIMITS = {
        groq: 500,
        opencode: 200,
    };

    function engineBlock(emoji, name, tier, result, used, limit) {
        const { bar, pct } = renderBar(used, limit);
        const statusIcon = result.online ? '🟢' : result.status.includes('⚠️') ? '🟡' : '🔴';
        const resetNote = result.resetIn ? ` · resets in ${result.resetIn}` : '';
        const noteStr = result.note ? `\n   ℹ️ ${result.note}` : '';
        const detailStr = result.detail ? `\n   ⚠️ ${result.detail}` : '';

        return (
            `${emoji} *${name}*  ${statusIcon} ${result.status.replace(/[✅⚠️❌] /, '')}\n` +
            `   \`${bar}\` ${pct}% used · ${used}/${limit} calls today\n` +
            `   📋 ${tier}${resetNote}${noteStr}${detailStr}\n\n`
        );
    }

    let report = `📊 *LIMECLAW ENGINE DASHBOARD*\n`;
    report += `🕐 ${now} CT · Resets in ${resetIn}\n`;
    report += `\`─────────────────────────────\`\n\n`;

    report += engineBlock(
        '⚡', 'Groq (Intent Parser)', 'Groq Dev — llama-3.3-70b',
        groqResult, usage.groq, LIMITS.groq
    );

    report += engineBlock(
        '🔧', 'OpenCode CLI (Coding Engine)', 'Local AI Agent',
        openCodeResult, usage.opencode, LIMITS.opencode
    );

    report += `\`─────────────────────────────\`\n`;
    report += `📌 _Usage bars reflect tasks run through LimeClaw today._`;

    return report;
}

module.exports = {
    getFullQuotaReport,
    checkGroqQuota,
    checkOpenCodeAvailability
};
