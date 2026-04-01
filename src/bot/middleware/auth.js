const config = require('../../utils/config');
const logger = require('../../utils/logger');

const authMiddleware = () => (ctx, next) => {
    const fromId = ctx.from?.id;
    if (!fromId) return; // Ignore updates without sender

    if (String(fromId) !== config.AUTH_CHAT_ID) {
        logger.warn(`Unauthorized access attempt from ID: ${fromId}`);
        return ctx.reply('Unauthorized: LimeClaw does not recognize you.').catch(err => {
            logger.error(`Failed to send unauthorized message: ${err.message}`);
        });
    }

    return next();
};

module.exports = authMiddleware;
