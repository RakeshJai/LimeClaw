/**
 * cascade.js — Engine runner for LimeClaw.
 *
 * Uses OpenCode CLI as the sole coding engine.
 *
 * Both the chat proxy (bot.js) and the task queue (queue.js) use this module.
 */

const { exec } = require('child_process');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────
// Error Classification Helpers
// ─────────────────────────────────────────────

function isRateLimit(text) {
    const t = text.toLowerCase();
    return t.includes('rate limit') || t.includes('429') ||
           t.includes('quota exceeded') || t.includes('too many requests') ||
           t.includes('exhausted') || t.includes('resource_exhausted');
}

function isNotFound(text) {
    const t = text.toLowerCase();
    return t.includes('not recognized') || t.includes('command not found') ||
           t.includes('enoent') || t.includes('cannot find module');
}

function isAuthError(text) {
    const t = text.toLowerCase();
    return t.includes('not logged in') || t.includes('unauthenticated') ||
           t.includes('please sign in') || t.includes('credentials');
}

// ─────────────────────────────────────────────
// Engine Runner
// ─────────────────────────────────────────────

/**
 * Try OpenCode CLI (local AI coding agent).
 * @returns {{ output: string, status: 'ok'|'rate_limited'|'not_found'|'auth_error'|'failed' }}
 */
function runOpenCode(prompt, cwd) {
    return new Promise((resolve) => {
        const safePrompt = prompt.replace(/"/g, '\\"');

        function attempt(cmd) {
            exec(cmd, { timeout: 120000, cwd, shell: true }, (err, stdout, stderr) => {
                const output = `${stdout}${stderr}`.replace(/\x1B\[[0-9;]*m/g, '').trim();
                const combined = `${output} ${err?.message ?? ''}`;

                if (isNotFound(combined)) {
                    // If PATH failed, try npx
                    if (cmd.startsWith('opencode')) {
                        return attempt(`npx opencode run "${safePrompt}"`);
                    }
                    return resolve({ output, status: 'not_found' });
                }
                if (isAuthError(combined)) return resolve({ output, status: 'auth_error' });
                if (isRateLimit(combined)) return resolve({ output, status: 'rate_limited' });
                if (err && !stdout) return resolve({ output, status: 'failed' });

                return resolve({ output: output || 'No output.', status: 'ok' });
            });
        }

        attempt(`opencode run "${safePrompt}"`);
    });
}

// ─────────────────────────────────────────────
// Engine Definitions
// ─────────────────────────────────────────────

const ENGINES = [
    { id: 'opencode', label: '🔧 OpenCode CLI', run: runOpenCode, isAsync: false },
];

const BUILD_ENGINES = ENGINES;

// ─────────────────────────────────────────────
// Main Cascade Runner
// ─────────────────────────────────────────────

/**
 * Run the engine cascade (single engine: OpenCode).
 *
 * @param {string} prompt - The prompt to send.
 * @param {{
 *   cwd?: string,
 *   startFrom?: string,
 *   onEngineSwitch?: (from: string, to: string, reason: string) => void,
 *   engines?: typeof ENGINES
 * }} [opts]
 *
 * @returns {{ output: string, engine: string, status: string }}
 */
async function runCascade(prompt, opts = {}) {
    const {
        cwd = process.cwd(),
        startFrom = null,
        onEngineSwitch,
        engines = ENGINES
    } = opts;

    let startIdx = 0;
    if (startFrom) {
        const idx = engines.findIndex(e => e.id === startFrom);
        if (idx !== -1) startIdx = idx;
    }

    for (let i = startIdx; i < engines.length; i++) {
        const engine = engines[i];
        logger.info(`Cascade: trying engine [${i + 1}/${engines.length}] ${engine.label}`);

        const result = await engine.run(prompt, cwd);

        if (result.status === 'ok') {
            return { output: result.output, engine: engine.id, label: engine.label, status: 'ok' };
        }

        const reason = result.status;
        logger.warn(`Cascade: ${engine.label} → ${reason}`);

        // Don't cascade on auth errors — user needs to fix credentials
        if (reason === 'auth_error') {
            return {
                output: `${engine.label} authentication failed. Run the CLI and sign in.`,
                engine: engine.id,
                label: engine.label,
                status: 'auth_error'
            };
        }
    }

    return {
        output: '❌ OpenCode engine is unavailable right now. Check that opencode is installed and authenticated.',
        engine: 'none',
        label: '—',
        status: 'all_failed'
    };
}

module.exports = {
    runCascade, runOpenCode, ENGINES, BUILD_ENGINES
};
