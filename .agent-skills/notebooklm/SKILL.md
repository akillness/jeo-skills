---
name: notebooklm
description: Use this skill when >
  Query Google NotebookLM directly from Claude Code using browser automation.
  Retrieves source-grounded, citation-backed answers from your NotebookLM notebooks
  without leaving the editor. Supports notebook library management, persistent Google
  authentication via Patchright, and smart notebook discovery. Local Claude Code only
  (not web UI). Triggers on: notebooklm, notebook lm, google notebooklm, notebook query,
  notebooklm query, ask notebooklm, notebooklm search.
allowed-tools: Bash Read Write Glob Grep
compatibility: >
  Local Claude Code only — web UI is not supported (sandbox restrictions prevent network access).
  Requires Python 3.10+, Chrome (installed via `patchright install chrome`), and a Google account.
  Free Google accounts are limited to 50 queries/day.
license: MIT
metadata:
  tags: notebooklm, google, browser-automation, patchright, research, notebook, knowledge-base, citation, grounded-answers
  platforms: Claude Code
  keyword: notebooklm
  version: "1.3.0"
  source: PleasePrompto/notebooklm-skill
  modernization: 2026-05-04
---

# notebooklm — Google NotebookLM Integration for Claude Code

> Query your NotebookLM notebooks directly. Source-grounded, citation-backed answers without leaving the editor.

`notebooklm` brings Google NotebookLM into your Claude Code workflow via browser automation (Patchright). Instead of switching tabs and copy-pasting, you ask questions from the terminal and get grounded answers from your uploaded sources.

## Installation

### Plugin (Claude Code — recommended)
```bash
claude plugin marketplace add PleasePrompto/notebooklm-skill
```

### Manual (git clone)
```bash
mkdir -p ~/.claude/skills
cd ~/.claude/skills
git clone https://github.com/PleasePrompto/notebooklm-skill.git notebooklm
```

### Skill (via skills CLI)
```bash
npx skills add https://github.com/akillness/jeo-skills --skill notebooklm
```

## Requirements

- **Python 3.10+** — for browser automation scripts
- **Chrome** — installed via `patchright install chrome` (Chromium will NOT work)
- **Google account** — a dedicated account is recommended for automation
- **Local Claude Code** — web UI is not supported (sandbox restrictions)
- **Internet access** — required to reach notebooklm.google.com

## Setup (first-time)

```bash
# 1. Install Python dependencies (auto-runs on first use)
cd ~/.claude/skills/notebooklm
python scripts/run.py auth_manager.py setup

# 2. A Chrome window opens — log in to Google manually
# The session is saved and reused for future queries

# 3. Add your first notebook
python scripts/run.py notebook_manager.py add \
  --url "https://notebooklm.google.com/notebook/YOUR_ID" \
  --name "my-research" \
  --description "Research notes on topic X"
```

## When to use this skill

- You have documents uploaded to NotebookLM and need citation-backed answers during development
- You want to cross-reference your research notes while writing code without switching windows
- You need source-grounded analysis from a curated document set (not a general web search)
- You are doing research synthesis across multiple notebooks on related topics

## Do not use when

- You need live web search — use `scrapling` or `web-research` instead
- You need general knowledge not in your uploaded documents — ask Claude directly
- You are running Claude from the web UI — browser automation is blocked in the sandbox
- Your Google account has exceeded the 50 queries/day free-tier limit

## Usage

### Ask a question
```bash
# Ask the currently active notebook
python scripts/run.py ask_question.py --question "What are the key findings about X?"

# Ask a specific notebook by ID
python scripts/run.py ask_question.py \
  --notebook-id "my-research" \
  --question "Summarize the methodology section"

# Ask with browser visible (useful for debugging)
python scripts/run.py ask_question.py \
  --question "What does source 3 say about Y?" \
  --show-browser
```

### Manage notebooks
```bash
# List all notebooks
python scripts/run.py notebook_manager.py list

# Search notebooks
python scripts/run.py notebook_manager.py search "machine learning"

# Activate a notebook (sets it as the default)
python scripts/run.py notebook_manager.py activate --id "my-research"

# Remove a notebook from the library
python scripts/run.py notebook_manager.py remove --id "old-notes"
```

### Authentication management
```bash
# Check auth status
python scripts/run.py auth_manager.py status

# Re-authenticate if session expired
python scripts/run.py auth_manager.py reauth

# Clear all auth data
python scripts/run.py auth_manager.py clear
```

## Data storage

All user data is stored locally at `~/.claude/skills/notebooklm/data/`:

```
data/
├── library.json          # Your notebook registry
├── auth_info.json        # Authentication metadata
├── browser_state/        # Persistent browser session
│   ├── browser_profile/  # Chrome profile data
│   └── state.json        # Cookies and localStorage
└── sessions.json         # Active session tracking
```

## Key constraints

| Constraint | Detail |
|------------|--------|
| **Rate limit** | 50 queries/day (free Google account) |
| **Local only** | Web UI sandbox blocks network access |
| **Manual upload** | Documents must be uploaded to NotebookLM manually first |
| **Browser overhead** | Each query opens a browser session (adds 3–10 seconds) |
| **Auth renewal** | Session cookies expire; run `auth_manager.py reauth` when needed |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Authentication failed` | Run `python scripts/run.py auth_manager.py reauth` |
| `Browser crash` | Run `python scripts/run.py auth_manager.py clear` then `setup` |
| `No response / timeout` | Increase timeout or run with `--show-browser` to inspect |
| `Rate limited` | Wait 24 hours or use a different Google account |
| `Chrome not found` | Run `patchright install chrome` (not `chromium`) |
| `Import error` | First-run auto-setup may have failed; run `setup_environment.py` manually |

Full troubleshooting guide: `~/.claude/skills/notebooklm/references/troubleshooting.md`

## Follow-up protocol

After each answer, always assess completeness:

> **"Is that ALL you need to know from this notebook on this topic?"**

NotebookLM can answer follow-up questions within the same session context. Ask targeted follow-ups before switching notebooks to get the most grounded coverage.

## References

- [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) — source repository
- `~/.claude/skills/notebooklm/references/usage_patterns.md` — advanced usage patterns
- `~/.claude/skills/notebooklm/references/api_reference.md` — programmatic usage
- `~/.claude/skills/notebooklm/references/troubleshooting.md` — troubleshooting guide
- `~/.claude/skills/notebooklm/AUTHENTICATION.md` — hybrid auth system details

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.
