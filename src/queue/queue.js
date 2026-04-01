const cron = require('node-cron');
const taskModel = require('../db/models');
const logger = require('../utils/logger');
const Executor = require('../engine/executor');
const { buildPrompt } = require('../engine/prompt');
const telegrafConfig = require('../utils/config');

let isWorkerRunning = false;
let activeExecutor = null;

// The bot interface will be set from index.js to allow sending messages
let botInstance = null;
function setBotInstance(bot) {
    botInstance = bot;
}

function notifyTelegram(msg) {
    if (botInstance && telegrafConfig.AUTH_CHAT_ID) {
        botInstance.telegram.sendMessage(telegrafConfig.AUTH_CHAT_ID, msg).catch(err => {
            logger.error(`Failed to send telegram notification: ${err.message}`);
        });
    }
}

async function processNextTask() {
    if (isWorkerRunning) return;
    isWorkerRunning = true;

    try {
        const task = taskModel.getNextQueued();
        if (!task) {
            isWorkerRunning = false;
            return;
        }

        logger.info(`Found queued task ${task.id}, beginning execution...`);
        taskModel.updateStatus(task.id, 'running');
        notifyTelegram(`🚀 Starting task ${task.id} in ${task.target_dir} using ${task.current_engine}.`);

        const promptContent = buildPrompt(task);
        activeExecutor = new Executor(task, promptContent);
        
        const result = await activeExecutor.run();
        
        activeExecutor = null;

        if (result.status === 'completed') {
            let phases = [];
            try { phases = JSON.parse(task.phases_json || '[]'); } catch(e) {}

            if (phases.length === 0) {
                // We just finished the PM phase. Parse the JSON plan from the output.
                try {
                    const match = result.output.match(/```json\n([\s\S]*?)\n```/);
                    const rawJson = match ? match[1] : result.output; // fallback to raw
                    const parsedPlan = JSON.parse(rawJson.trim().replace(/^```json/, '').replace(/```$/, ''));
                    
                    const newPhases = parsedPlan.map(p => ({ ...p, status: 'pending' }));
                    taskModel.updatePhases(task.id, newPhases);
                    taskModel.updateStatus(task.id, 'queued'); // Requeue to start Phase 1
                    notifyTelegram(`📋 PM finalized plan for task ${task.id} with ${newPhases.length} phases! Starting implementation.`);
                } catch (err) {
                    logger.error(`Failed to parse PM plan: ${err.message}`);
                    taskModel.updateStatus(task.id, 'failed');
                    notifyTelegram(`❌ Task ${task.id} failed. The PM agent did not return a valid Phase JSON.`);
                }
            } else {
                // We finished an implementation phase
                const currentPhaseIndex = phases.findIndex(p => p.status !== 'completed');
                if (currentPhaseIndex !== -1) {
                    phases[currentPhaseIndex].status = 'completed';
                    taskModel.updatePhases(task.id, phases);
                    
                    if (currentPhaseIndex === phases.length - 1) {
                        taskModel.updateStatus(task.id, 'completed');
                        notifyTelegram(`✅ Phase ${currentPhaseIndex + 1}/${phases.length} completed. Task ${task.id} fully finished! Check ${task.target_dir}.`);
                    } else {
                        taskModel.updateStatus(task.id, 'queued'); // Requeue for next phase
                        notifyTelegram(`✅ Phase ${currentPhaseIndex + 1}/${phases.length} (${phases[currentPhaseIndex].name}) complete. Starting next phase.`);
                    }
                }
            }
        } else if (result.status === 'rate_limited') {
            logger.warn(`Task ${task.id} hit rate limit on OpenCode engine.`);
            taskModel.updateStatus(task.id, 'rate_limited');
            notifyTelegram(`⚠️ Task ${task.id} paused — OpenCode is rate-limited. It will resume when quota is available.`);
        } else if (result.status === 'paused') {
            taskModel.updateStatus(task.id, 'paused');
            notifyTelegram(`⏸ Task ${task.id} has been paused.`);
        } else {
            taskModel.updateStatus(task.id, 'failed');
            notifyTelegram(`❌ Task ${task.id} failed (${result.error || result.code}). Check the logs.`);
        }

    } catch (err) {
        logger.error(`Worker error: ${err.message}`);
    } finally {
        isWorkerRunning = false;
    }
}

function stopActiveTask() {
    if (activeExecutor && !activeExecutor.isPaused) {
        activeExecutor.pause();
        return true;
    }
    return false;
}

function startPolling() {
    logger.info('Starting queue worker polling...');
    cron.schedule('*/5 * * * * *', () => { // Poll every 5 seconds
        processNextTask();
    });
}

/**
 * Periodically checks if OpenCode is back online to resume rate-limited tasks.
 */
async function startQuotaReviver() {
    logger.info('Starting quota reviver loop (every 2m)...');
    cron.schedule('*/2 * * * *', async () => {
        try {
            const rateLimitedTasks = taskModel.getRateLimitedTasks();
            if (rateLimitedTasks.length === 0) return;

            logger.info(`Checking OpenCode availability to resume ${rateLimitedTasks.length} rate-limited tasks...`);
            const { checkOpenCodeAvailability } = require('../utils/quota');
            const openCode = await checkOpenCodeAvailability();

            if (openCode.online) {
                for (const task of rateLimitedTasks) {
                    taskModel.updateStatus(task.id, 'queued');
                }
                notifyTelegram(`♻️ OpenCode is back online! Resuming ${rateLimitedTasks.length} rate-limited tasks.`);
            }
        } catch (err) {
            logger.error(`Quota reviver error: ${err.message}`);
        }
    });
}

module.exports = { startPolling, startQuotaReviver, setBotInstance, stopActiveTask };
