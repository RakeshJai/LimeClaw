/**
 * cascade.js — Unified fallback engine for LimeClaw.
 *
 * Priority order:
 *   1. Gemini CLI   (Google AI Pro)    — PM agent / primary CLI
 *   2. MiMo V2 Pro Free (OpenRouter)   — always-available API fallback
 *
 * Both the chat proxy (bot.js) and the task queue (queue.js) use this module.
 */

const { exec } = require('child_process');
const config = require('../utils/config');
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
// Individual Engine Runners
// ─────────────────────────────────────────────

/**
 * Try Gemini CLI (Google AI Pro).
 * @returns {{ output: string, status: 'ok'|'rate_limited'|'not_found'|'auth_error'|'failed' }}
 */
function runGemini(prompt, cwd) {
    return new Promise((resolve) => {
        const safePrompt = prompt.replace(/"/g, '\\"');
        // Try PATH first, then absolute node invocation
        const cliPath = config.GEMINI_CLI_PATH ||
            'C:\\Users\\rakes\\AppData\\Roaming\\npm\\node_modules\\@google\\gemini-cli\\dist\\index.js';

        function attempt(cmd) {
            exec(cmd, { timeout: 120000, cwd, shell: true }, (err, stdout, stderr) => {
                const output = `${stdout}${stderr}`.replace(/\x1B\[[0-9;]*m/g, '').trim();
                const combined = `${output} ${err?.message ?? ''}`;

                if (isNotFound(combined)) {
                    // If PATH failed, try node direct
                    if (cmd.startsWith('gemini')) {
                        return attempt(`node --no-warnings=DEP0040 "${cliPath}" -p "${safePrompt}" --yolo`);
                    }
                    return resolve({ output, status: 'not_found' });
                }
                if (isAuthError(combined)) return resolve({ output, status: 'auth_error' });
                if (isRateLimit(combined)) return resolve({ output, status: 'rate_limited' });
                if (err && !stdout) return resolve({ output, status: 'failed' });

                return resolve({ output: output || 'No output.', status: 'ok' });
            });
        }

        attempt(`gemini -p "${safePrompt}" --yolo`);
    });
}

/**
 * Try MiMo V2 Pro Free via OpenAI-compatible API (no CLI needed — always available if key is set).
 * @returns {{ output: string, status: 'ok'|'rate_limited'|'no_key'|'failed' }}
 */
async function runMiMo(prompt) {
    const apiKey = config.MIMO_API_KEY;
    if (!apiKey) return { output: 'MiMo API key not configured.', status: 'no_key' };

    try {
        const response = await fetch(`${config.MIMO_BASE_URL || 'https://openrouter.ai/api/v1'}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: config.MIMO_MODEL_ID || 'opencode/mimo-v2-pro-free',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 4096,
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            const msg = data.error?.message || JSON.stringify(data);
            if (isRateLimit(msg)) return { output: msg, status: 'rate_limited' };
            return { output: msg, status: 'failed' };
        }

        const output = data.choices?.[0]?.message?.content?.trim() || 'No response.';
        return { output, status: 'ok' };
    } catch (err) {
        const msg = err.message || '';
        if (isRateLimit(msg)) return { output: msg, status: 'rate_limited' };
        return { output: msg, status: 'failed' };
    }
}

// ─────────────────────────────────────────────
// Engine Definitions (ordered cascade)
// ─────────────────────────────────────────────

const ENGINES = [
    { id: 'gemini', label: '💎 Gemini CLI (PM Agent)', run: runGemini, isAsync: false },
    { id: 'mimo', label: '🧠 MiMo V2 Pro Free', run: runMiMo, isAsync: true },
];

const BUILD_ENGINES = ENGINES;

// ─────────────────────────────────────────────
// Main Cascade Runner
// ─────────────────────────────────────────────

/**
 * Try all engines in order until one succeeds.
 *
 * @param {string} prompt - The prompt to send.
 * @param {{
 *   cwd?: string,
 *   startFrom?: string,           // engine id to start from (e.g. 'mimo' to skip Gemini)
 *   onEngineSwitch?: (from: string, to: string, reason: string) => void,
 *   engines?: typeof ENGINES      // Override the default cascade
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

        // Notify caller about the switch (used by bot.js to edit the status message)
        if (i + 1 < engines.length && onEngineSwitch) {
            const next = engines[i + 1];
            onEngineSwitch(engine.id, next.id, reason);
        }

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
        output: '❌ All engines exhausted. Gemini CLI and MiMo V2 Pro Free are both unavailable right now.',
        engine: 'none',
        label: '—',
        status: 'all_failed'
    };
}

module.exports = {
    runCascade, runGemini, runMiMo, ENGINES, BUILD_ENGINES,
    isRateLimit, isNotFound
};
