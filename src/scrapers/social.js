const { exec } = require('child_process');
const cron = require('node-cron');
const config = require('../utils/config');
const logger = require('../utils/logger');

const processedIds = new Set();

async function analyzeContent(text, type) {
    let prompt;
    if (type === 'pain_point') {
        prompt = `Analyze this comment. Is the user expressing a genuine pain point, frustration with a software tool, or specifically wishing for a new tool/feature?
If YES, reply with a JSON object. If NO, reply with EXACTLY the word "IGNORE" and nothing else.
Comment: "${text}"

JSON format required if YES:
{
  "isMatch": true,
  "type": "PAIN_POINT",
  "problem": "Brief summary of the problem",
  "category": "UX/UI, Missing Feature, Bug, Cost, etc.",
  "idea": "A potential SaaS idea to solve this"
}`;
    } else if (type === 'new_saas') {
        prompt = `Analyze this post. Is this a new SaaS project/tool launch? Is it interesting or simple enough that a similar concept could be built during a hackathon?
If YES, reply with a JSON object. If NO, reply with EXACTLY the word "IGNORE" and nothing else.
Post: "${text}"

JSON format required if YES:
{
  "isMatch": true,
  "type": "NEW_SAAS",
  "name": "Probable name of the tool",
  "description": "What it does",
  "hackathonPotential": "Why this is a good reference for a hackathon build"
}`;
    }

    try {
        const safePrompt = prompt.replace(/"/g, '\\"');
        const result = await new Promise((resolve, reject) => {
            exec(`opencode run "${safePrompt}"`, { timeout: 60000, shell: true }, (err, stdout, stderr) => {
                const output = `${stdout}${stderr}`.replace(/\x1B\[[0-9;]*m/g, '').trim();
                if (err && !stdout) return reject(err);
                resolve(output);
            });
        });

        if (result === "IGNORE" || result.includes("IGNORE")) return null;

        const jsonStr = result.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
        return JSON.parse(jsonStr);
    } catch (err) {
        return null;
    }
}

async function scanHackerNews(bot) {
    logger.info('Scanning Hacker News for SaaS ideas and pain points...');
    let found = [];
    try {
        // Queries for pain points and comments
        const painPointQueries = ['"I wish"', '"bothers me"', '"is there a tool"', '"I hate how"', '"frustrating"'];
        
        for (const query of painPointQueries) {
            const encodedQuery = encodeURIComponent(query);
            const response = await fetch(`https://hn.algolia.com/api/v1/search_by_date?query=${encodedQuery}&tags=comment&hitsPerPage=10`);
            if (!response.ok) continue;
            const data = await response.json();
            
            for (const hit of data.hits) {
                if (processedIds.has(hit.objectID)) continue;
                processedIds.add(hit.objectID);
                
                const text = (hit.comment_text || '').substring(0, 500);
                if (!text || text.length < 20) continue;
                
                const analysis = await analyzeContent(text, 'pain_point');
                if (analysis && analysis.isMatch) {
                    found.push(analysis);
                    const message = `🚨 **Pain Point Radar (Hacker News)**\n\n` +
                                    `**Problem:** ${analysis.problem}\n` +
                                    `**Idea:** ${analysis.idea}\n\n` +
                                    `[View Source Context](https://news.ycombinator.com/item?id=${hit.objectID})`;
                    if (bot && config.AUTH_CHAT_ID) await bot.telegram.sendMessage(config.AUTH_CHAT_ID, message, { parse_mode: 'Markdown' });
                }
            }
        }

        // Queries for new SaaS launches (Show HN)
        const showHnResponse = await fetch(`https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=20`);
        if (showHnResponse.ok) {
            const showHnData = await showHnResponse.json();
            
            for (const hit of showHnData.hits) {
                if (processedIds.has(hit.objectID)) continue;
                processedIds.add(hit.objectID);
                
                const text = `${hit.title} - ${hit.story_text || ''}`.substring(0, 500);
                const analysis = await analyzeContent(text, 'new_saas');
                if (analysis && analysis.isMatch) {
                    found.push(analysis);
                    const message = `🚀 **New SaaS Inspiration (Show HN)**\n\n` +
                                    `**Tool:** ${analysis.name}\n` +
                                    `**What it does:** ${analysis.description}\n` +
                                    `**Hackathon Potential:** ${analysis.hackathonPotential}\n\n` +
                                    `[View Launch](https://news.ycombinator.com/item?id=${hit.objectID})`;
                    if (bot && config.AUTH_CHAT_ID) await bot.telegram.sendMessage(config.AUTH_CHAT_ID, message, { parse_mode: 'Markdown' });
                }
            }
        }

    } catch (err) {
        logger.error(`Social scan error: ${err.message}`);
    }
    return found;
}

async function scanReddit(bot) {
    logger.info('Scanning Reddit for SaaS ideas and pain points...');
    let found = [];
    try {
        // Use the Reddit JSON API with a descriptive bot User-Agent (required by Reddit ToS)
        // old.reddit.com/.json endpoints are more reliable than www.reddit.com for bots
        const fetchOptions = {
            headers: {
                'User-Agent': 'LimeClaw:v1.0 (autonomous hackathon research agent; contact: github.com/limeclaw)'
            }
        };

        // 1. Scan for pain points across SaaS/dev subreddits
        const subreddits = ['SaaS', 'webdev', 'Entrepreneur', 'startups'];
        for (const sub of subreddits) {
            const url = `https://old.reddit.com/r/${sub}/new.json?limit=10`;
            let response;
            try {
                response = await fetch(url, fetchOptions);
            } catch (fetchErr) {
                logger.warn(`Reddit fetch failed for r/${sub}: ${fetchErr.message}`);
                continue;
            }

            if (!response.ok) {
                logger.warn(`Reddit r/${sub} returned HTTP ${response.status}. Skipping.`);
                continue;
            }

            let data;
            try {
                data = await response.json();
            } catch (parseErr) {
                logger.warn(`Reddit r/${sub} response was not valid JSON (likely bot-blocked). Skipping.`);
                continue;
            }

            if (!data.data || !data.data.children) continue;

            for (const child of data.data.children) {
                const post = child.data;
                if (processedIds.has(post.id)) continue;
                processedIds.add(post.id);

                const text = `${post.title} - ${post.selftext || ''}`.substring(0, 500);
                if (!text || text.length < 20) continue;

                const analysis = await analyzeContent(text, 'pain_point');
                if (analysis && analysis.isMatch) {
                    found.push(analysis);
                    const message = `🚨 **Pain Point Radar (Reddit: r/${post.subreddit})**\n\n` +
                                    `**Problem:** ${analysis.problem}\n` +
                                    `**Idea:** ${analysis.idea}\n\n` +
                                    `[View Thread](https://old.reddit.com${post.permalink})`;
                    if (bot && config.AUTH_CHAT_ID) await bot.telegram.sendMessage(config.AUTH_CHAT_ID, message, { parse_mode: 'Markdown' });
                }
            }
        }

        // 2. Scan r/SideProject for new SaaS launches
        let spResponse;
        try {
            spResponse = await fetch('https://old.reddit.com/r/SideProject/new.json?limit=15', fetchOptions);
        } catch (fetchErr) {
            logger.warn(`Reddit r/SideProject fetch failed: ${fetchErr.message}`);
            return found;
        }

        if (spResponse.ok) {
            let spData;
            try { spData = await spResponse.json(); } catch(e) { return found; }

            if (spData.data && spData.data.children) {
                for (const child of spData.data.children) {
                    const post = child.data;
                    if (processedIds.has(post.id)) continue;
                    processedIds.add(post.id);

                    const text = `${post.title} - ${post.selftext || ''}`.substring(0, 500);
                    const analysis = await analyzeContent(text, 'new_saas');
                    if (analysis && analysis.isMatch) {
                        found.push(analysis);
                        const message = `🚀 **New SaaS Inspiration (Reddit: r/SideProject)**\n\n` +
                                        `**Tool:** ${analysis.name}\n` +
                                        `**What it does:** ${analysis.description}\n` +
                                        `**Hackathon Potential:** ${analysis.hackathonPotential}\n\n` +
                                        `[View Launch](https://old.reddit.com${post.permalink})`;
                        if (bot && config.AUTH_CHAT_ID) await bot.telegram.sendMessage(config.AUTH_CHAT_ID, message, { parse_mode: 'Markdown' });
                    }
                }
            }
        }

    } catch (err) {
        logger.error(`Reddit scan error: ${err.message}`);
    }
    return found;
}

function startSocialScanner(bot) {
    // Only schedule if the user explicitly wants background scanning.
    // By default social scanning is on-demand only.
    logger.info('Social scanner ready (on-demand only, no background schedule).');
}

module.exports = { startSocialScanner, scanReddit, scanHackerNews };
