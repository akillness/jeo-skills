---
name: agentic-skills
description: Production Engineering Framework and oh-my-gods Installer Bundle for AI Agents
license: MIT
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch Agent
metadata:
  tags: agentic-skills, production-engineering, spec-driven, tdd, code-review, security, performance, git-workflow, ci-cd, google-practices, oh-my-gods, god-skills, installer, bundle, multi-runtime
  version: 2.0.0
  source: "https://github.com/addyosmani/agent-skills"
  upstream: "https://github.com/akillness/oh-my-gods"
  installer: "https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh"
---



# agentic-skills — Production Engineering Framework & Installer Bundle

> **Keyword**: `agentic-skills` · `/spec` · `/plan` · `/build` · `/test` · `/review` · `/install-bundle`
>
> "Seems right is never sufficient." — ground every output in measurable verification.

`agentic-skills` is a unified skill that combines a production-grade engineering framework with a one-shot installer for the **oh-my-gods** bundle (80+ curated agent skills).

## Core Capabilities

### 1. Production Engineering Framework
Draws from Google's engineering culture: trunk-based development, Shift Left testing, Hyrum's Law, Chesterton's Fence, and the code-as-liability mindset.

-   **Spec-Driven**: Use `.specify/` to define contracts before coding.
-   **TDD**: Red → Green → Refactor.
-   **Quality Gates**: Security hardening, performance optimization, and 5-axis code review.

### 2. oh-my-gods Installer Bundle
A declarative wrapper around the official `install.sh` that ships with `akillness/oh-my-gods`. It pins the installer URL, exposes canonical environment knobs, and targets multiple runtimes.

## When to use this skill

-   The request needs a disciplined spec-before-code contract to prevent drift.
-   You need incremental implementation with thin vertical slices and frequent verification.
-   The user wants to drop the entire **oh-my-gods** bundle onto their machine.
-   A new machine needs the full agent-skills catalog before any specific skill is touched.

## Do not use this skill when

-   The user needs multi-agent orchestration routing → route to `jeo`, `omc`, or `harness`.
-   The task is primarily pre-implementation landscape research → route to `survey`.
-   The user only needs **one specific skill** from oh-my-gods → copy that single directory instead.

## Installation & Usage

### Engineering Framework (Claude Code)
```bash
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills
```

### Installer Bundle
Pipe the upstream installer through `bash` with the chosen knobs:

```bash
# Default: install everything across every detected runtime, backup previous install
curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash

# Claude Code only, with LangChain skills
PLATFORM=claude WITH_LANGCHAIN=true \
  curl -fsSL https://raw.githubusercontent.com/akillness/oh-my-gods/main/install.sh | bash
```

## Environment Variables (Installer)

| Variable | Default | Purpose |
|----------|---------|---------|
| `INSTALL_GLOBAL` | `true` | Install to canonical `~/.agent-skills` |
| `INSTALL_MODE` | `silent` | `silent` · `auto` · `interactive` |
| `SKIP_BACKUP` | `false` | Skip backup of an existing install |
| `WITH_LANGCHAIN` | `false` | Also install `langchain-ai/langchain-skills` |
| `PLATFORM` | `all` | `claude` · `gemini` · `codex` · `opencode` · `all` |

## Spec-Stack Integration

This skill adheres to the `.specify/` spec-stack pattern. See `.specify/agentic-skills-spec.md` for the full specification.
