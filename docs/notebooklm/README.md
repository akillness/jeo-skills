# notebooklm — Google NotebookLM Integration for Claude Code

> Source-grounded, citation-backed answers from your NotebookLM notebooks — directly in Claude Code.

← [Back to README](../../README.md)

---

## What `notebooklm` owns

`notebooklm` is the skill for [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill), a browser-automation integration that connects Google NotebookLM to Claude Code via Patchright (a Playwright fork with anti-detection features).

Use this skill when you need to:
- **Query your NotebookLM notebooks** without leaving the editor
- **Get source-grounded, citation-backed answers** from documents you've uploaded to NotebookLM
- **Manage a local notebook library** with smart discovery and metadata
- **Persist Google authentication** across sessions without repeated manual login
- **Synthesize research** from multiple notebooks on related topics

---

## Installation

### Plugin (Claude Code — recommended)
```bash
claude plugin marketplace add PleasePrompto/notebooklm-skill
```

### Manual clone
```bash
mkdir -p ~/.claude/skills
cd ~/.claude/skills
git clone https://github.com/PleasePrompto/notebooklm-skill.git notebooklm
```

### Via skills CLI
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill notebooklm
```

---

## Requirements

- Python 3.10+
- Chrome (installed via `patchright install chrome` — Chromium will NOT work)
- Google account (dedicated automation account recommended)
- **Local Claude Code only** — web UI not supported

---

## Quick Start

```bash
# 1. First-time authentication (opens a Chrome window)
python scripts/run.py auth_manager.py setup

# 2. Add a notebook
python scripts/run.py notebook_manager.py add \
  --url "https://notebooklm.google.com/notebook/YOUR_ID" \
  --name "my-research" \
  --description "Research on topic X"

# 3. Ask a question
python scripts/run.py ask_question.py --question "What are the key findings?"
```

---

## Key Constraints

| Constraint | Detail |
|------------|--------|
| Rate limit | 50 queries/day (free Google account) |
| Local only | Web UI sandbox blocks network access |
| Manual upload | Upload documents to NotebookLM first |
| Browser overhead | Each query takes 3–10 extra seconds |

---

## Further Reading

- [PleasePrompto/notebooklm-skill](https://github.com/PleasePrompto/notebooklm-skill) — source repository
- [SKILL.md](../../.agent-skills/notebooklm/SKILL.md) — full skill instructions
- `references/usage_patterns.md` — advanced usage patterns
- `references/troubleshooting.md` — troubleshooting guide
- `AUTHENTICATION.md` — hybrid auth system details (browser profile + cookie injection)
