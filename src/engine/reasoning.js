const Groq = require('groq-sdk');
const config = require('../utils/config');
const logger = require('../utils/logger');

let groq;
if (config.GROQ_API_KEY) {
    groq = new Groq({ apiKey: config.GROQ_API_KEY });
}

/**
 * Parse the user's natural language intent to a structured action object.
 * Uses Groq (llama-3.3-70b) as the first-line-of-entry NLP parser.
 * @param {string} text - Raw user message.
 * @param {object|null} activeTaskContext - Currently running task, if any.
 * @param {{ role: string, content: string }[]} [history=[]] - Prior conversation messages for multi-turn context.
 */
async function parseUserIntent(text, activeTaskContext, history = []) {
    if (!groq) {
        logger.warn('Groq API Key not found. Cannot parse intent.');
        return { action: 'reply', message: 'I need a Groq API key to understand natural language.' };
    }

    const systemPrompt = `You are a helpful assistant for LimeClaw, an autonomous coding agent orchestrator. The user will ask you to perform operations in natural language.
    Your job is to parse their intent into a strict JSON object. No markdown formatting, just pure JSON.
    
    Available actions:
    1. {"action": "build", "dir": "<absolute target path>", "description": "<what they want to build>"} - For starting a new coding task. Guess the path if not fully provided.
    2. {"action": "pitch", "dir": "<absolute target path>", "description": "<what they want slides for>"} - If they ask for a presentation, pitch deck, etc.
    3. {"action": "research", "source": "devpost", "count": 5} - If they ask to research Devpost, hackathon winners, or winning ideas. Parse the count if they specify a number.
    4. {"action": "research", "source": "reddit", "count": 5} - If they ask to scan Reddit for pain points, SaaS ideas from Reddit, or side projects.
    5. {"action": "research", "source": "hackernews", "count": 5} - If they ask to scan Hacker News, HN, or Show HN launches.
    6. {"action": "brainstorm", "count": 3} - If they ask for ideas, brainstorming, project suggestions, or inspiration (generic, no specific source).
    7. {"action": "status"} - If they ask how things are going.
    8. {"action": "logs"} - If they ask to see the logs.
    9. {"action": "pause"} - If they want to stop or pause.
    10. {"action": "resume", "taskId": <number>} - If they want to resume.
    11. {"action": "reply", "message": "<your answer>"} - For basic chat, general questions, or if you need more context. You MUST use prior conversation context when answering these.
    12. {"action": "prompt_coders", "prompt": "<the prompt>"} - If the user is specifically asking the coding agent (OpenCode CLI) to write code, explain code, or perform a complex analysis.

    Current context: ${activeTaskContext ? `An active task is running (ID: ${activeTaskContext.id} in ${activeTaskContext.target_dir})` : 'No tasks currently running.'}
    
    JSON Output Only.`;

    // Build message array: system + prior history (capped at last 10 to save tokens) + current message
    const recentHistory = history.slice(-10);
    const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: text }
    ];

    try {
        const completion = await groq.chat.completions.create({
            messages,
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 512,
        });

        const replyStr = completion.choices[0].message.content.trim();
        // Remove markdown formatting if the model slipped up
        const jsonStr = replyStr.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        
        return JSON.parse(jsonStr);
    } catch (err) {
        logger.error(`Groq error: ${err.message}`);
        return { action: 'reply', message: 'Sorry, I hit an error trying to understand that.' };
    }
}

module.exports = { parseUserIntent };
