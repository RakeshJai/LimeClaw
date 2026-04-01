const { Telegraf } = require('telegraf');
const config = require('../utils/config');
const logger = require('../utils/logger');
const authMiddleware = require('./middleware/auth');
const taskModel = require('../db/models');
const memoryModel = require('../db/memory');
const { parseUserIntent } = require('../engine/reasoning');
const { getFullQuotaReport } = require('../utils/quota');

function setupBot(bot) {
    bot.use(authMiddleware());

    bot.command('start', (ctx) => {
        ctx.reply('🚀 *LimeClaw Initialized.*\nConnected to OpenCode CLI. Type /help to see all commands.', { parse_mode: 'Markdown' });
    });

    bot.command('help', (ctx) => {
        const msg =
`🛸 *LIMECLAW COMMAND CENTER*
\`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`

🔧 *System*
/start — Wake up & initialize the bot
/help — Show this command reference
/quota — Live engine status \& usage dashboard
/clear — Wipe chat history \& conversation memory

🏗️ *Build Tasks*
/opencode \<prompt\> — Send a prompt directly to OpenCode CLI

\`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`
💬 *Natural Language Commands*
_Just type these as plain messages:_

🔨 *Build* — \"Build a dashboard in C:/Projects/MyApp\"
📊 *Pitch* — \"Generate a pitch deck for MyApp\"
🔍 *Research* — \"Find 5 Devpost winners\"
              — \"Scan Reddit for SaaS ideas\"
              — \"Scan Hacker News for pain points\"
🧠 *Brainstorm* — \"Give me 3 hackathon ideas\"
📋 *Status* — \"What's running?\"
📜 *Logs* — \"Show me the logs\"
⏸️ *Pause* — \"Stop the current task\"
▶️ *Resume* — \"Resume task 4\"

\`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`
💡 _Any other message is sent to OpenCode CLI._`;

        return ctx.reply(msg, { parse_mode: 'Markdown' });
    });

    bot.command('quota', async (ctx) => {
        ctx.reply('⏳ Checking all engine quotas... this takes a few seconds.');
        try {
            const report = await getFullQuotaReport();
            return ctx.reply(report, { parse_mode: 'Markdown' });
        } catch (err) {
            logger.error(`Quota check error: ${err.message}`);
            return ctx.reply('Failed to check quotas. Check bot logs.');
        }
    });

    bot.command('clear', async (ctx) => {
        const chatId = ctx.chat.id;
        const currentMsgId = ctx.message.message_id;
        
        // Wipe conversation memory for this chat
        memoryModel.clear(chatId);

        try {
            // Bulk delete up to 100 recent messages at once to prevent Phone UI lag
            let idsToDelete = [];
            for (let i = currentMsgId; i >= Math.max(1, currentMsgId - 99); i--) {
                idsToDelete.push(i);
            }
            
            await ctx.telegram.deleteMessages(chatId, idsToDelete);
            
            const finalMsg = await ctx.reply('✨ Messages cleared instantly!');
            setTimeout(() => {
                ctx.telegram.deleteMessage(chatId, finalMsg.message_id).catch(() => {});
            }, 4000);
        } catch (bulkErr) {
            // Fallback to manual loop if bulk delete fails for some reason
            let deletedCount = 0;
            const statusMsg = await ctx.reply('🧹 Sweeping recent messages...');
            for (let i = currentMsgId; i > Math.max(0, currentMsgId - 100); i--) {
                try {
                    await ctx.telegram.deleteMessage(chatId, i);
                    deletedCount++;
                } catch (err) {}
            }
            try {
                const finalMsg = await ctx.reply(`✨ Cleared ${deletedCount} messages.`);
                setTimeout(() => {
                    ctx.telegram.deleteMessage(chatId, finalMsg.message_id).catch(() => {});
                }, 4000);
            } catch (e) {}
        }
    });

    const { runCascade, BUILD_ENGINES } = require('../engine/cascade');

    async function handleAutoFallbackPrompt(ctx, prompt) {
        const statusMsg = await ctx.reply(`🤖 Prompting OpenCode CLI...`);
        const chatId = ctx.chat.id;
        const msgId = statusMsg.message_id;

        try {
            const result = await runCascade(prompt, {
                engines: BUILD_ENGINES,
            });

            if (result.status === 'all_failed') {
                const report = await getFullQuotaReport();
                return ctx.telegram.editMessageText(chatId, msgId, undefined, `❌ *Engine Unavailable*\n\n${report}`, { parse_mode: 'Markdown' });
            }

            if (result.status !== 'ok') {
                return ctx.telegram.editMessageText(chatId, msgId, undefined, result.output);
            }

            let response = result.output;
            if (response.length > 4000) response = response.substring(0, 4000) + '...\n[Truncated]';
            
            const header = '🔧 OpenCode CLI Output';

            return ctx.telegram.editMessageText(chatId, msgId, undefined, `[${header}]\n${response}`);
        } catch (err) {
            return ctx.telegram.editMessageText(chatId, msgId, undefined, `❌ Error executing prompt: ${err.message}`);
        }
    }

    bot.command('opencode', (ctx) => {
        const prompt = ctx.message.text.substring('/opencode'.length).trim();
        if (!prompt) return ctx.reply('Send a prompt: /opencode <message>');
        handleAutoFallbackPrompt(ctx, prompt);
    });

    bot.on('text', async (ctx) => {
        const text = (ctx.message.text || '').toLowerCase();
        if (text.startsWith('/start') || text.startsWith('/help') || text.startsWith('/quota') || text.startsWith('/clear') || text.startsWith('/opencode')) return;

        ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
        
        const chatId = String(ctx.chat.id);
        const userMessage = ctx.message.text;

        // Store incoming user message in memory
        memoryModel.append(chatId, 'user', userMessage);

        const activeTask = taskModel.getActiveTask();
        const history = memoryModel.getHistory(chatId);
        const intent = await parseUserIntent(userMessage, activeTask, history);

        // Helper to send a reply AND persist the assistant response to memory
        const sendAndRemember = async (msg, opts = {}) => {
            const sent = await ctx.reply(msg, opts);
            memoryModel.append(chatId, 'assistant', msg.substring(0, 2000)); // cap stored length
            return sent;
        };

        switch (intent.action) {
            case 'build':
                if (!intent.dir || !intent.description) {
                    return sendAndRemember('I need both a target directory and a description to start a build.');
                }
                const taskId = taskModel.create(intent.description, intent.dir);
                return sendAndRemember(`✅ Queued build task ID: ${taskId}\nDir: ${intent.dir}\nDesc: ${intent.description}`);

            case 'pitch':
                if (!intent.dir || !intent.description) {
                    return sendAndRemember('I need a target directory to analyze and a description for the presentation.');
                }
                const phaseJson = JSON.stringify([{
                    name: "Generate Pitch Deck and Diagrams",
                    agent: "sales",
                    instructions: intent.description,
                    status: "pending"
                }]);
                const pitchTaskId = taskModel.create(`Pitch Deck: ${intent.description}`, intent.dir);
                taskModel.updatePhases(pitchTaskId, JSON.parse(phaseJson));
                return sendAndRemember(`📊 Queued Pitch & Diagram task ID: ${pitchTaskId}\nThe Sales Agent will generate slides.md and export them to PDF!`);

            case 'research': {
                const count = intent.count || 5;
                const source = intent.source;

                if (source === 'devpost') {
                    await ctx.reply(`🕵️ Research Agent is scanning Devpost for ${count} projects. This might take a moment...`);
                    const { getDevpostWinners } = require('../scrapers/devpost');
                    const winners = await getDevpostWinners(count);

                    if (!winners || winners.length === 0) {
                        return sendAndRemember('⚠️ Devpost and its fallbacks all failed. Try again shortly.');
                    }
                    let msg = `🏆 **Top ${winners.length} Devpost Projects**\n\n`;
                    winners.forEach((w, i) => {
                        msg += `**${i + 1}. ${w.title}**\n${w.description}\n[Link](${w.url})\n\n`;
                    });
                    return sendAndRemember(msg, { parse_mode: 'Markdown' });
                }

                if (source === 'reddit') {
                    await ctx.reply(`🔍 Scanning Reddit for SaaS pain points and launches...`);
                    const { scanReddit } = require('../scrapers/social');
                    const findings = await scanReddit(null); // null = don't auto-post, return results
                    if (!findings || findings.length === 0) {
                        return sendAndRemember('⚠️ Reddit returned no actionable results. It may be rate-limiting. Try again in a minute.');
                    }
                    let msg = `📡 **Reddit Scan — ${findings.length} finding(s)**\n\n`;
                    findings.slice(0, count).forEach((f, i) => {
                        if (f.type === 'PAIN_POINT') {
                            msg += `**${i + 1}. [Pain Point]** ${f.problem}\n💡 Idea: ${f.idea}\n\n`;
                        } else {
                            msg += `**${i + 1}. [New SaaS]** ${f.name}: ${f.description}\n🏆 ${f.hackathonPotential}\n\n`;
                        }
                    });
                    return sendAndRemember(msg, { parse_mode: 'Markdown' });
                }

                if (source === 'hackernews') {
                    await ctx.reply(`🔍 Scanning Hacker News for SaaS ideas and pain points...`);
                    const { scanHackerNews } = require('../scrapers/social');
                    const findings = await scanHackerNews(null);
                    if (!findings || findings.length === 0) {
                        return sendAndRemember('⚠️ HN returned no actionable results right now. Try again shortly.');
                    }
                    let msg = `📡 **HN Scan — ${findings.length} finding(s)**\n\n`;
                    findings.slice(0, count).forEach((f, i) => {
                        if (f.type === 'PAIN_POINT') {
                            msg += `**${i + 1}. [Pain Point]** ${f.problem}\n💡 Idea: ${f.idea}\n\n`;
                        } else {
                            msg += `**${i + 1}. [New SaaS]** ${f.name}: ${f.description}\n🏆 ${f.hackathonPotential}\n\n`;
                        }
                    });
                    return sendAndRemember(msg, { parse_mode: 'Markdown' });
                }

                return sendAndRemember('Supported research sources: `devpost`, `reddit`, `hackernews`.');
            }

            case 'brainstorm': {
                // Groq brainstorm — fast NLP, no scraping needed
                const count = intent.count || 3;
                await ctx.reply(`🧠 Brainstorming ${count} niche hackathon idea(s)...`);
                const Groq = require('groq-sdk');
                const gc = new Groq({ apiKey: config.GROQ_API_KEY });
                try {
                    const completion = await gc.chat.completions.create({
                        messages: [
                            ...history.slice(-6),
                            { role: 'user', content: `Generate ${count} niche, solo-developer-feasible hackathon project ideas. For each: title, one-line pitch, key tech stack, and why it would win. NO generic CRUD apps or to-do lists. Format in markdown.` }
                        ],
                        model: 'llama-3.3-70b-versatile',
                        temperature: 0.8,
                        max_tokens: 1024,
                    });
                    const reply = completion.choices[0].message.content.trim();
                    return sendAndRemember(reply);
                } catch (err) {
                    return sendAndRemember(`Brainstorm failed: ${err.message}`);
                }
            }

            case 'status': {
                let reply = '';
                const active = taskModel.getActiveTask();
                const queued = taskModel.getNextQueued();
                const memCount = memoryModel.count(chatId);
                if (active) reply += `🔥 ACTIVE TASK:\nID: ${active.id}\nTarget: ${active.target_dir}\nEngine: ${active.current_engine}\n\n`;
                else reply += `😴 No active tasks.\n\n`;
                if (queued) reply += `⏳ NEXT IN QUEUE:\nID: ${queued.id}\nTarget: ${queued.target_dir}\nEngine: ${queued.current_engine}\n\n`;
                reply += `🧠 Memory: ${memCount} message(s) in context.`;
                return sendAndRemember(reply || 'No tasks.');
            }

            case 'logs': {
                let logTaskId = intent.taskId;
                if (!logTaskId && activeTask) logTaskId = activeTask.id;
                if (!logTaskId) return sendAndRemember('No active task to get logs for.');
                const logs = taskModel.getLogs(logTaskId, 15);
                if (!logs || logs.length === 0) return sendAndRemember(`No logs found for task ${logTaskId}.`);
                const logContent = logs.map(l => `[${l.log_type.toUpperCase()}] ${l.content.trim().substring(0, 50)}...`).join('\n');
                return sendAndRemember(`📜 Recent logs for Task ${logTaskId}:\n${logContent}`);
            }

            case 'pause': {
                if (!activeTask) return sendAndRemember('No active task to pause.');
                const queueManager = require('../queue/queue');
                if (queueManager.stopActiveTask()) {
                    return sendAndRemember(`Attempting to pause active task ${activeTask.id}...`);
                } else {
                    return sendAndRemember('Could not pause task at this time.');
                }
            }

            case 'resume': {
                if (!intent.taskId) return sendAndRemember('Which task ID should I resume?');
                const task = taskModel.getById(intent.taskId);
                if (!task) return sendAndRemember('Task not found.');
                taskModel.updateStatus(intent.taskId, 'queued');
                return sendAndRemember(`▶️ Resuming task ${intent.taskId}. Re-queued for execution.`);
            }

            case 'prompt_coders':
                return handleAutoFallbackPrompt(ctx, intent.prompt || userMessage);

            case 'reply':
            default:
                if (intent.message) {
                    return sendAndRemember(intent.message);
                }
                return handleAutoFallbackPrompt(ctx, userMessage);
        }
    });

    bot.catch((err, ctx) => {
        logger.error(`Bot Error: ${err}`);
        ctx.reply('I ran into an error processing that.');
    });
}

function startBot() {
    if (!config.BOT_TOKEN) {
        logger.warn('Bot token missing. Telegram integration is disabled.');
        return null;
    }
    const bot = new Telegraf(config.BOT_TOKEN);
    setupBot(bot);
    bot.launch();
    logger.info('Telegram Bot launched successfully.');

    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    return bot;
}

module.exports = { startBot };
