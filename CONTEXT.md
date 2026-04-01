# 🧠 SESSION CONTEXT — READ THIS FIRST

> **This file is the entry point for all new OpenCode sessions.**
> If you are an agent starting a new session, follow the instructions below immediately.

---

## Step 1: Load Memory Bank

Read these files in order to restore full project context:

1. `.opencode/memory-bank/projectbrief.md` — What this project is
2. `.opencode/memory-bank/activeContext.md` — What's currently happening
3. `.opencode/memory-bank/techContext.md` — Dependencies & environment
4. `.opencode/memory-bank/systemPatterns.md` — Architecture & conventions
5. `.opencode/memory-bank/progress.md` — What's done, what's next
6. `.opencode/memory-bank/changelog.md` — Recent changes log

## Step 2: Report Context Loaded

After reading all memory bank files, greet the user with:
- A one-sentence project summary
- The current focus (from activeContext.md)
- Any recent changes (from changelog.md)

---

## Project Snapshot

**LimeClaw** is an autonomous coding agent orchestrator using Telegram as its interface.

- **Repo**: https://github.com/RakeshJai/LimeClaw
- **Branch**: `main`
- **Stack**: Node.js + Telegraf + Groq + Gemini + SQLite
- **Agents**: 11 specialized sub-agents in `.opencode/agents/`
- **Memory Bank**: `.opencode/memory-bank/` (6 files)

---

*This file ensures every new session has immediate project context. Do not delete.*
