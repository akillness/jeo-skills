---
name: agenticskills
description: >
  One-shot installer for the akillness/oh-my-gods agent skill bundle (80+ skills
  spanning agent-browser, agent-workflow, ai-research-skills, api-design, and the
  full god-skills catalog). Use when the user asks to add the oh-my-gods skill
  pack, bring in the AgenticSkills bundle, or wants every god-skill copied into
  Claude Code, Codex CLI, Antigravity/Gemini, and OpenCode in one step.
  Triggers on: AgenticSkills, agenticskills, oh-my-gods, god-skills, install
  oh-my-gods, bring in agentic skills bundle, install gods skills, add god skills.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Works with Claude Code, Codex CLI, Antigravity/Gemini CLI, and OpenCode.
  Canonical destination: $HOME/.agent-skills (mirrored to ~/.claude/skills,
  ~/.codex/skills, ~/.gemini/skills, and ~/.opencode/skills via npx-skills-add).
metadata:
  tags: agenticskills, oh-my-gods, god-skills, installer, bundle, agent-skills, multi-runtime
  keyword: agenticskills
  version: "1.0.0"
  upstream: https://github.com/akillness/oh-my-gods
  installer: https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh
---

# AgenticSkills — One-shot installer for oh-my-gods

> **Keywords**: `AgenticSkills` · `agenticskills` · `oh-my-gods` · `god-skills`
>
> Use this skill when the user wants to drop the entire **oh-my-gods** bundle
> (80+ curated agent skills) onto their machine without picking each one
> individually.

This skill is a thin, declarative wrapper around the official `install.sh`
that ships with [akillness/oh-my-gods](https://github.com/akillness/oh-my-gods).
It pins the installer URL, exposes the canonical environment knobs, and
documents how to target a subset of runtimes from a single command.

## When to use this skill

- The user says "install AgenticSkills", "bring in oh-my-gods", "add the god skills bundle", or any equivalent phrasing.
- A new machine needs the full agent-skills catalog before any specific skill is touched.
- An existing install needs to be refreshed (re-running is safe — the upstream installer backs up the previous install unless `SKIP_BACKUP=true`).
- The user wants to add LangChain skills alongside oh-my-gods (`WITH_LANGCHAIN=true`).

## Do not use when

- The user only needs **one specific skill** from oh-my-gods → copy that
  single `.god-skills/<name>/` directory instead, or use `npx skills add` with
  `--skill <name>`.
- The user has not yet authorized network access (`curl | bash`) — fall back
  to `git clone` + manual review.

## Instructions

### Step 1 — Confirm scope with the user

Before running the installer, confirm:

1. **Target platforms**: `claude`, `codex`, `gemini`, `opencode`, or `all` (default).
2. **LangChain bundle**: install alongside (`WITH_LANGCHAIN=true`) or not.
3. **Backup policy**: keep existing `~/.agent-skills` backup (default) or skip.

### Step 2 — Run the installer

Pipe the upstream installer through `bash` with the chosen knobs:

```bash
# Default: install everything across every detected runtime, backup previous install
curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash

# Claude Code only, with LangChain skills
PLATFORM=claude WITH_LANGCHAIN=true \
  curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash

# Quiet re-install without backup (CI / scripted use)
INSTALL_MODE=silent SKIP_BACKUP=true \
  curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash
```

For a security-conscious flow, download, review, then run:

```bash
curl -fsSLO https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh
less install.sh           # human review
bash install.sh
```

### Step 3 — Verify the install

```bash
ls ~/.agent-skills | head
ls ~/.claude/skills 2>/dev/null  | head
ls ~/.codex/skills 2>/dev/null   | head
ls ~/.gemini/skills 2>/dev/null  | head
ls ~/.opencode/skills 2>/dev/null | head
```

You should see directories such as `agent-browser`, `agent-workflow`,
`agentation`, `ai-research-skills`, `api-design`, and the rest of the
`.god-skills/` catalog mirrored into each detected runtime.

### Step 4 — Re-run or update

The installer is idempotent. To refresh:

```bash
curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash
```

A backup of the previous `~/.agent-skills` is written next to the directory
unless `SKIP_BACKUP=true` is set.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `INSTALL_GLOBAL` | `true` | Install to canonical `~/.agent-skills` |
| `INSTALL_MODE` | `silent` | `silent` · `auto` · `interactive` |
| `SKIP_BACKUP` | `false` | Skip backup of an existing install |
| `WITH_LANGCHAIN` | `false` | Also install `langchain-ai/langchain-skills` |
| `PLATFORM` | `all` | `claude` · `gemini` · `codex` · `opencode` · `all` |

## Catalog snapshot

oh-my-gods currently ships 80+ skills under `.god-skills/`, including:

- `agent-browser`, `agentation`, `agent-configuration`, `agent-development-principles`
- `agent-evaluation`, `agent-manager`, `agent-principles`, `agent-workflow`
- `agents-cli`, `ai-research-skills`, `api-design`, `api-documentation`
- …plus the long-tail engineering, ops, and data skills

See [oh-my-gods tree](https://github.com/akillness/oh-my-gods/tree/main/.god-skills)
for the full list at any time.

## Best practices

1. **Review before piping `curl | bash`** when the user has a security policy.
2. **Pin a commit** if the user wants reproducibility — replace `main` in the
   installer URL with a tag or commit SHA.
3. **Co-exist with oh-my-skills**: this bundle installs alongside the skills
   already shipped by `akillness/oh-my-skills`; there are no destructive
   overlaps as the destination namespaces differ.
4. **Re-run after upstream changes** rather than diffing individual skills —
   the upstream installer handles the canonical sync.

## References

- Upstream repo: <https://github.com/akillness/oh-my-gods>
- Upstream installer: <https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh>
- This repo's catalog entry: `README.md` → Infrastructure table
