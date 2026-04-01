const config = require('../utils/config');
const logger = require('../utils/logger');

// Devpost is JS-rendered — plain fetch returns a shell with no project data.
// Strategy: hit their JSON search endpoint (undocumented but stable),
// then fall back to MiMo-synthesized ideas if that also fails.
async function getDevpostWinners(count = 5) {
    logger.info(`Fetching ${count} Devpost winners...`);

    // Attempt 1: Devpost JSON search API (returns lightweight JSON)
    try {
        const url = `https://devpost.com/software/search?query=winner&page=1`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/javascript, */*',
                'X-Requested-With': 'XMLHttpRequest',
                'Referer': 'https://devpost.com/software/search'
            }
        });

        if (response.ok) {
            const data = await response.json();
            // Response shape: { software: [ { name, tagline, url, ... } ] }
            if (data.software && data.software.length > 0) {
                const projects = data.software.slice(0, count).map(p => ({
                    title: p.name || 'Unknown Project',
                    description: p.tagline || 'No description.',
                    url: p.url || 'https://devpost.com'
                }));
                logger.info(`Devpost JSON API returned ${projects.length} results.`);
                return projects;
            }
        }
        logger.warn(`Devpost JSON API returned ${response.status}. Trying scrape fallback...`);
    } catch (err) {
        logger.warn(`Devpost JSON API attempt failed: ${err.message}. Trying scrape fallback...`);
    }

    // Attempt 2: Scrape the Devpost "Explore" winning projects page
    try {
        const response = await fetch('https://devpost.com/software/search?query=is%3Awinner&order_by=trending', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });
        const html = await response.text();

        const projects = [];
        // Try multiple HTML patterns Devpost uses
        const patterns = [
            /<h5[^>]*class="[^"]*software-entry-name[^"]*"[^>]*>\s*([^<]+)\s*<\/h5>[\s\S]*?class="[^"]*tagline[^"]*"[^>]*>\s*([^<]+)\s*<\/p>/g,
            /<a[^>]+href="(https:\/\/devpost\.com\/software\/[^"]+)"[^>]*>[\s\S]*?<h5[^>]*>([\s\S]*?)<\/h5>/g
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(html)) !== null && projects.length < count) {
                const title = (match[2] || match[1] || '').trim().replace(/<[^>]*>/gm, '');
                const desc = (match[3] || match[2] || '').trim().replace(/<[^>]*>/gm, '');
                if (title && title.length > 2) {
                    projects.push({
                        title,
                        description: desc || 'Click link to view details.',
                        url: match[1]?.startsWith('http') ? match[1] : `https://devpost.com/software/${title.toLowerCase().replace(/\s+/g, '-')}`
                    });
                }
            }
            if (projects.length > 0) break;
        }

        if (projects.length > 0) {
            logger.info(`Devpost HTML scrape returned ${projects.length} results.`);
            return projects;
        }
        logger.warn('Devpost HTML scrape found no matches. Devpost is likely JS-gated. Falling back to MiMo synthesis.');
    } catch (err) {
        logger.warn(`Devpost HTML scrape failed: ${err.message}. Falling back to MiMo synthesis.`);
    }

    // Attempt 3: MiMo-synthesized real hackathon winner concepts
    if (config.MIMO_API_KEY) {
        logger.info(`Generating ${count} hackathon-winner-style ideas via MiMo...`);
        try {
            const response = await fetch(`${config.MIMO_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.MIMO_API_KEY}`,
                },
                body: JSON.stringify({
                    model: config.MIMO_MODEL_ID,
                    messages: [{
                        role: 'user',
                        content: `List ${count} real-world Devpost hackathon winning project concepts from recent (2023-2024) hackathons. 
For each, give: a realistic project name, a one-sentence tagline, and a Devpost-style URL slug.
Format STRICTLY as a JSON array: [{"title": "...", "description": "...", "url": "https://devpost.com/software/slug"}]
No markdown, no explanation, just the JSON array.`
                    }],
                    temperature: 0.6,
                    max_tokens: 1024,
                }),
            });
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content?.trim()
                .replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            const ideas = JSON.parse(raw);
            logger.info(`MiMo synthesized ${ideas.length} Devpost-style concepts.`);
            return ideas.slice(0, count);
        } catch (gErr) {
            logger.error(`MiMo synthesis also failed: ${gErr.message}`);
        }
    }

    return [];
}

module.exports = { getDevpostWinners };
