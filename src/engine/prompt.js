const fs = require('fs');
const path = require('path');
const config = require('../utils/config');

/**
 * Builds the comprehensive prompt for to the CLI Agent.
 * Re-reads existing project CLAUDE.md/GEMINI.md context if applicable,
 * along with the actual task.
 */
function buildPrompt(task) {
    let promptStr = `You are running in FULL AUTO headless mode (LimeClaw system).\n\n`;
    let phases;
    
    try {
        phases = JSON.parse(task.phases_json || '[]');
    } catch(e) {
        phases = [];
    }

    if (phases.length === 0) {
        // PM Phase - We need to plan
        const agentFilePath = path.join(__dirname, '../../.opencode/agents/pm.md');
        if (fs.existsSync(agentFilePath)) {
            promptStr += `Your Persona:\n${fs.readFileSync(agentFilePath, 'utf8')}\n\n`;
        }
        promptStr += `TASK DESCRIPTION:\n${task.description}\n\n`;
        promptStr += `RULES:\n1. Output ONLY the JSON array plan.\n`;
    } else {
        // Find which phase we are on
        const currentPhaseIndex = phases.findIndex(p => p.status !== 'completed');
        if (currentPhaseIndex === -1) {
            return `Task is already fully completed.`;
        }
        const currentPhase = phases[currentPhaseIndex];
        
        let targetAgent = currentPhase.agent || 'meta';
        const agentFilePath = path.join(__dirname, `../../.opencode/agents/${targetAgent}.md`);
        if (fs.existsSync(agentFilePath)) {
            promptStr += `Your Persona:\n${fs.readFileSync(agentFilePath, 'utf8')}\n\n`;
        } else {
            promptStr += `You are acting as the ${targetAgent} agent.\n\n`;
        }

        promptStr += `OVERALL GOAL:\n${task.description}\n\n`;
        promptStr += `CURRENT PHASE TO EXECUTE (Phase ${currentPhaseIndex + 1} of ${phases.length}):\n`;
        promptStr += `Name: ${currentPhase.name}\n`;
        promptStr += `Instructions: ${currentPhase.instructions}\n\n`;

        promptStr += `RULES:\n`;
        promptStr += `1. You are running unattended. You must COMPLETE ONLY the current phase using all necessary tools without asking for human interaction.\n`;
        promptStr += `2. If you are stuck or looping on an error for too long, just stop and summarize where you left off.\n`;
        promptStr += `3. Always report your final status before exiting.\n`;
    }

    return promptStr;
}

module.exports = { buildPrompt };
