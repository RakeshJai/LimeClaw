const logger = require('./utils/logger');
const config = require('./utils/config');
const { initSchema } = require('./db/schema');
const queueManager = require('./queue/queue');
const { startBot } = require('./bot/bot');

async function main() {
    logger.info('Booting LimeClaw orchestrator...');

    // 1. Init Database
    logger.info('Checking databases...');
    initSchema();

    // 2. Start Telegram Bot
    logger.info('Starting Telegram Bot...');
    const botInstance = startBot();
    if (botInstance) {
        queueManager.setBotInstance(botInstance);
    } else {
        logger.warn('Running without Telegram connectivity.');
    }

    // 3. Start Social SaaS Scanner
    logger.info('Initializing social pain-point scanner...');
    const { startSocialScanner } = require('./scrapers/social');
    startSocialScanner(botInstance);

    // 4. Start Polling for Jobs
    logger.info('Starting task queue polling...');
    queueManager.startPolling();
    queueManager.startQuotaReviver();

    logger.info('LimeClaw is online and waiting for commands.');
}

main().catch(err => {
    logger.error(`Fatal crash: ${err.message}`);
    process.exit(1);
});
