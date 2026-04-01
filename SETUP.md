# OpenCode Memory Bank Setup Guide

A step-by-step guide to setting up the memory bank auto-loading system for any OpenCode project. This ensures **zero context loss** between AI coding sessions.

---

## Overview

### What Is the Memory Bank?

The memory bank is a structured set of Markdown files stored in `.opencode/memory-bank/` that capture the full state of your project — architecture, decisions, progress, dependencies, and recent changes. It acts as a persistent knowledge base that any AI agent can read at the start of a session.

### Why Use It?

- **Context continuity**: New sessions instantly know what the project is, what's been done, and what comes next
- **Faster onboarding**: Agents skip the "read the entire codebase" step and jump straight to productive work
- **Decision tracking**: Architectural decisions and open questions persist across sessions
- **Changelog integrity**: Every change is timestamped and logged automatically

### How It Works

```
New Session Starts
       │
       ▼
  CONTEXT.md  ──────────►  "Read these 6 files in order"
       │
       ▼
  Memory Bank Files  ─────►  Full project context loaded
       │
       ▼
  Agent Greeting  ─────────►  Summary + Current Focus + Recent Changes
```

The entry point is `CONTEXT.md` at the workspace root. It instructs every new session to load the memory bank files before doing anything else.

---

## Directory Structure

```
project-root/
├── CONTEXT.md                         # Session entry point (auto-load instructions)
├── .opencode/
│   ├── agents/                        # Agent definitions
│   │   ├── backend.md
│   │   ├── docs.md                    # Memory bank maintenance agent
│   │   ├── frontend.md
│   │   ├── debugger.md
│   │   ├── meta.md
│   │   ├── pm.md
│   │   ├── qa_tester.md
│   │   ├── refactor.md
│   │   ├── research.md
│   │   ├── sales.md
│   │   └── github.md
│   └── memory-bank/                   # Context files (6 required)
│       ├── projectbrief.md
│       ├── activeContext.md
│       ├── techContext.md
│       ├── systemPatterns.md
│       ├── progress.md
│       └── changelog.md
```

---

## Required Files

### 1. `CONTEXT.md` (workspace root)

The session entry point. Every new OpenCode session reads this first.

**Purpose**: Instructs the agent to load all memory bank files and greet with a project summary.

**Template**:

```markdown
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

*This file ensures every new session has immediate project context. Do not delete.*
```

---

### 2. `.opencode/memory-bank/projectbrief.md`

**Purpose**: High-level project overview. The "elevator pitch" for the codebase.

**Should contain**:
- Project name
- Purpose (1-2 sentences)
- Tech stack (table format preferred)
- Key modules and their paths
- Entry point

**Template**:

```markdown
# Project Brief

## Project Name
[Your Project Name]

## Purpose
[What does this project do? Why does it exist?]

## Tech Stack
- **Runtime**: [e.g., Node.js, Python]
- **Framework**: [e.g., Express, FastAPI]
- **Database**: [e.g., PostgreSQL, SQLite]
- **Other**: [any other major dependencies]

## Key Modules

| Module | Path | Purpose |
|---|---|---|
| [Name] | `src/module/` | [What it does] |

## Entry Point
`src/index.js` - [brief description of boot sequence]
```

---

### 3. `.opencode/memory-bank/activeContext.md`

**Purpose**: What's happening right now. Changes every session.

**Should contain**:
- Current focus (what you're working on)
- Recent changes (bulleted list)
- Open decisions or blockers
- Agent inventory (if using sub-agents)

**Template**:

```markdown
# Active Context

## Current Focus
[What is the primary task/feature being worked on?]

## Recent Changes
- [Change 1]
- [Change 2]

## Open Decisions
- [Decision that needs to be made]

## Agent Inventory
[List of available agents and their roles]
```

---

### 4. `.opencode/memory-bank/techContext.md`

**Purpose**: Technical environment details. Rarely changes.

**Should contain**:
- Dependencies (table from package.json or requirements.txt)
- Environment variables needed
- Run/dev/test commands
- Database info (type, location, schema)

**Template**:

```markdown
# Tech Context

## Dependencies

| Package | Purpose |
|---|---|
| [package-name] | [what it does] |

## Environment Variables
- `VAR_NAME` — Description
- `VAR_NAME` — Description

## Run Commands
- `npm start` — Start the application
- `npm test` — Run tests

## Database
- Type: [SQLite/Postgres/etc.]
- Location: [path or connection string]
- Schema: [path to schema file]
```

---

### 5. `.opencode/memory-bank/systemPatterns.md`

**Purpose**: Architecture patterns and code conventions.

**Should contain**:
- Architecture overview (monolith, microservices, event-driven, etc.)
- Code conventions (module system, async patterns, naming)
- Key design patterns used
- Module dependency graph

**Template**:

```markdown
# System Patterns

## Architecture
- [Architecture style: e.g., modular monolith]

## Code Conventions
- [Module system: CommonJS / ESM]
- [Async pattern: callbacks / promises / async-await]
- [Logging: which logger, where to import]

## Key Design Patterns
- **[Pattern Name]**: [Description] (`path/to/file.js`)

## Module Dependencies
```
index.js -> server.js -> routes/
routes/ -> controllers/ -> models/
```
```

---

### 6. `.opencode/memory-bank/progress.md`

**Purpose**: Track what's done, in-progress, and upcoming.

**Should contain**:
- Completed features (bulleted list)
- In-progress items
- Next steps / planned work

**Template**:

```markdown
# Progress

## Completed
- [Feature 1]
- [Feature 2]

## In Progress
- See `activeContext.md` for current work

## Next
- [Upcoming feature or plan]
```

---

### 7. `.opencode/memory-bank/changelog.md`

**Purpose**: Timestamped log of all changes. Grows over time, never shrinks.

**Should contain**:
- Dated entries in reverse chronological order
- ISO timestamp format: `YYYY-MM-DD HH:MM`
- What changed and why

**Template**:

```markdown
# Changelog

## 2026-01-15 14:30 - [Short Description]
- [What changed]
- [Why it changed]

## 2026-01-14 09:00 - Initial Setup
- Project initialized
- Memory bank created
```

---

## The DOCS Agent

The DOCS agent (`.opencode/agents/docs.md`) is responsible for automatically maintaining the memory bank. After any code change, invoke this agent to scan the codebase and update all memory bank files.

**Full Agent Definition**:

```markdown
---
description: Scans codebase changes and maintains a memory bank for agent context continuity.
mode: subagent
---

# DOCS Agent - Codebase Memory Bank Manager

You are the Documentation and Memory Bank Agent. Your sole purpose is to scan
the codebase, detect additions and changes, and produce/update a structured
"memory bank" inside `.opencode/memory-bank/`. This memory bank acts as a
persistent context layer so that other agents can pick up work without
re-reading the entire codebase.

## Core Mission
After a feature, fix, or implementation is completed, you are invoked to:
1. Scan the codebase (especially recent git changes)
2. Update or create memory bank files
3. Ensure the memory bank is accurate, concise, and immediately useful to
   other agents

## Memory Bank Files You Maintain

All files live in `.opencode/memory-bank/`:

| File | Purpose |
|---|---|
| `projectbrief.md` | High-level project overview, goals, tech stack |
| `activeContext.md` | What is currently being worked on, recent changes, open decisions |
| `systemPatterns.md` | Architecture patterns, code conventions, naming, module structure |
| `techContext.md` | Dependencies, config keys, environment setup, run commands |
| `progress.md` | What works, what's in progress, what's next |
| `changelog.md` | Timestamped log of every change you detect |

## Workflow

### Step 1 - Detect Changes
- Run `git diff --name-status HEAD~1..HEAD` to see what files changed
- Run `git diff --stat` to see unstaged changes
- Run `git log --oneline -10` for recent commit context
- Read any newly added or modified files to understand what was added

### Step 2 - Read Existing Memory Bank
- Read every file in `.opencode/memory-bank/` that already exists
- Understand the current state before making updates

### Step 3 - Update Memory Bank
- **projectbrief.md**: Update if new modules, dependencies, or architectural
  shifts occurred
- **activeContext.md**: Replace with the latest feature/fix context and what
  changed
- **systemPatterns.md**: Update if new patterns, conventions, or design
  decisions emerged
- **techContext.md**: Update if new dependencies, env vars, or config changes
  were made
- **progress.md**: Move completed items, add new in-progress items
- **changelog.md**: Append a new dated entry summarizing what changed and why

### Step 4 - Verify Completeness
- Ensure every `src/` directory has at least a brief mention
- Ensure imports and cross-module dependencies are documented
- Ensure the memory bank would let a fresh agent understand the project in
  under 2 minutes

## Writing Style
- **Concise over verbose**. Use bullet points. Use code snippets only when
  they clarify structure.
- **Always include file paths** in `path:line` format when referencing
  specific code.
- **Timestamp entries** in changelog using ISO format `YYYY-MM-DD HH:MM`.
- **Do not hallucinate**. Only document what you can verify by reading the
  actual files or git output.

## When Memory Bank Does Not Exist Yet
If `.opencode/memory-bank/` is empty, perform a full initial scan:
1. Read `package.json` for dependencies and scripts
2. Read every file in `src/` to understand modules
3. Run `git log --oneline -20` for project history
4. Generate all memory bank files from scratch based on what you find

## Session Auto-Load
A `CONTEXT.md` file exists at the workspace root that instructs new sessions
to read the memory bank first. If this file is missing, recreate it to ensure
session continuity.

## Output
After completing your scan and updates, return a brief summary:
- Files updated: [list]
- Key changes detected: [1-3 bullet points]
- Memory bank status: [complete / partial / errors]
```

---

## How to Initialize

### Step 1: Create the Directory Structure

```bash
mkdir -p .opencode/agents
mkdir -p .opencode/memory-bank
```

### Step 2: Create CONTEXT.md

Copy the template from [Section 1](#1-contextmd-workspace-root) above and place it at the workspace root (`CONTEXT.md`).

### Step 3: Create All 6 Memory Bank Files

Use the templates from [Section 2–7](#required-files) above. Populate them based on an initial scan of your codebase:

```bash
# Scan your codebase
cat package.json                  # for dependencies
ls src/                           # for module structure
git log --oneline -20             # for project history
```

Create each file:
- `.opencode/memory-bank/projectbrief.md`
- `.opencode/memory-bank/activeContext.md`
- `.opencode/memory-bank/techContext.md`
- `.opencode/memory-bank/systemPatterns.md`
- `.opencode/memory-bank/progress.md`
- `.opencode/memory-bank/changelog.md`

### Step 4: Create the DOCS Agent

Copy the full agent definition from [The DOCS Agent](#the-docs-agent) section above and save it to `.opencode/agents/docs.md`.

### Step 5: Initial Codebase Scan

Run through your codebase manually (or invoke the DOCS agent) to populate the memory bank with real data:

1. Read `package.json` → populate `techContext.md`
2. Explore `src/` directories → populate `systemPatterns.md` and `projectbrief.md`
3. Check git log → populate `changelog.md` and `progress.md`
4. Document current work → populate `activeContext.md`

---

## How Auto-Loading Works

```
┌─────────────────────────────────────────────┐
│           New OpenCode Session              │
│                                             │
│  1. Agent reads CONTEXT.md                  │
│  2. CONTEXT.md says: "Read these 6 files"   │
│  3. Agent reads all memory bank files       │
│  4. Agent greets user with:                 │
│     • Project summary (1 sentence)          │
│     • Current focus                         │
│     • Recent changes                        │
│                                             │
│  Result: Zero context loss                  │
└─────────────────────────────────────────────┘
```

**Key mechanics**:
- `CONTEXT.md` is always at the workspace root — it's the first file any agent reads
- The memory bank files are read in a specific order (broad → specific → temporal)
- The agent provides a human-friendly greeting that confirms context was loaded
- If any memory bank file is missing, the agent knows to recreate it

---

## Git Tracking Options

### Option A: Track Memory Bank in Git (Recommended)

If you want the memory bank versioned and shared across machines/teammates:

**Do NOT add** `.opencode/` to `.gitignore`. The memory bank files will be committed with your codebase.

Your `.gitignore` should still exclude secrets:
```gitignore
.env
*.log
node_modules/
dist/
```

### Option B: Local-Only Memory Bank

If you want the memory bank to be personal/local (not shared):

**Add** to `.gitignore`:
```gitignore
.opencode/
```

This keeps the memory bank on your machine only. Useful if the memory bank contains personal workflow notes or if multiple developers maintain separate memory banks.

### Hybrid Approach (Recommended for Teams)

Track the agents and memory bank structure, but exclude personal state:

```gitignore
# Track agents and memory bank structure (committed)
# But exclude session-specific state if desired
.opencode/memory-bank/activeContext.md   # personal, changes every session
```

---

## Tips

1. **Keep it concise**: Memory bank files should be scannable in under 2 minutes
2. **Update after every session**: Invoke the DOCS agent to keep things current
3. **Use file paths**: Always reference `path:line` when pointing to code
4. **Timestamp everything**: Use `YYYY-MM-DD HH:MM` format in changelog
5. **Don't hallucinate**: Only document what you can verify by reading actual files
6. **One sentence summary**: The project brief should explain the project in one sentence at the top

---

*Generated for [LimeClaw](https://github.com/RakeshJai/LimeClaw) — an autonomous coding agent orchestrator using Telegram.*
