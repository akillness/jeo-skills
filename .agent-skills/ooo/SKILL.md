---
name: ooo
description: >
  Run the Ouroboros specification-first development loop: reduce ambiguity with a
  Socratic interview, freeze an immutable seed/spec, execute against that contract,
  verify before claiming success, and keep looping until completion is actually
  verified. Use when the user wants spec-first clarification, immutable requirements,
  drift-aware implementation, or a persistent completion loop that should keep going
  until tests / checks / acceptance criteria pass. Triggers on: ooo, ouroboros,
  interview, seed, run workflow, evaluate, evolve, ooo ralph, specification first,
  socratic interview, ambiguity reduction, persistent completion.
allowed-tools: Read Write Bash Grep Glob WebFetch Agent
metadata:
  tags: ooo, ouroboros, specification-first, socratic, interview, seed, evaluate, evolve, loop, completion, nine-minds, double-diamond, convergence, drift, multi-platform, mcp, plugin
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: ooo
  version: 0.29.0
  source: Q00/ouroboros
  license: MIT
---

# ooo — Ouroboros Specification-First Workflow

> Stop prompting. Start specifying.

`ooo` is the **portable Ouroboros method** for spec-first development:

```text
Interview → Seed → Execute → Evaluate → Evolve
                     ↓
                 ooo ralph
             (persist until verified)
```

## Installation

### Plugin (recommended for Claude Code)
```bash
claude plugin marketplace add Q00/ouroboros
```

### pip
```bash
pip install ouroboros-ai           # base
pip install ouroboros-ai[all]      # full: Claude, LiteLLM, MCP, TUI
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/jeo-skills --skill ooo
```

### Setup runtimes
```bash
ouroboros setup                    # auto-detect Claude / Codex / OpenCode
ouroboros setup --runtime claude
ouroboros setup --runtime codex
ouroboros setup --runtime opencode --opencode-mode plugin
```

## When to use

- Vague request needs a Socratic interview before coding starts
- Requirements should become an **immutable seed/spec** before implementation
- Task needs a **verify-before-done** loop, not a one-shot answer
- You want to **keep going until completion is actually verified**
- Measure **drift** against the original contract
- Repeated failures need structured **unstuck** step instead of blind retries

## Do not use when

- Task is mainly platform setup or runtime commands → `omc` / `omx` / `ohmg`
- Task is mainly permission posture, sandbox, trust folders → (configure via `ouroboros setup`)
- Task needs integrated project ledgers + plan review + cleanup workflow → `jeo`
- Task is only pre-implementation landscape research → `survey`

## Core commands

### Interview — clarify before coding
```bash
ouroboros init start "build a task management CLI"
ouroboros init start --resume <interview-id>
ouroboros init list
```

**Ambiguity gate**
- Greenfield: Goal 40% + Constraints 30% + Success 30%
- Brownfield: Goal 35% + Constraints 25% + Success 25% + Context 15%
- Do not move to seed until **Ambiguity ≤ 0.2**

### Seed — freeze the spec
After interview completes, a `seed.yaml` is generated in `.ouroboros/seeds/`.

```yaml
# example seed.yaml
goal: "Build a CLI task manager with SQLite persistence"
constraints:
  - "Python 3.12+"
  - "No external HTTP dependencies"
acceptance_criteria:
  - "CRUD operations work end-to-end"
  - "All unit tests pass"
```

### Run — execute against the seed
```bash
ouroboros run workflow <seed.yaml>
ouroboros run workflow <seed.yaml> --sequential
ouroboros run workflow <seed.yaml> --no-qa
ouroboros run resume [execution-id]
```

**Options**
| Flag | Purpose |
|------|---------|
| `-o/-O` | Enable/disable orchestrator (default: on) |
| `--runtime` | Override runtime backend |
| `-s` | Execute acceptance criteria sequentially |
| `-n` | Dry-run: validate without executing |
| `--no-qa` | Skip post-execution QA evaluation |

### Evaluate — verify before done
Three-stage gate:
1. **Mechanical** — lint, tests, build, typecheck, coverage
2. **Semantic** — acceptance criteria and goal alignment
3. **Consensus** — optional multi-model agreement

```bash
ouroboros status executions
ouroboros status execution <execution-id> --events
```

**Drift thresholds**
| Range | Status |
|-------|--------|
| 0.00–0.15 | Excellent |
| 0.15–0.30 | Acceptable — watch closely |
| 0.30+ | Correct course before continuing |

### Ralph — persistent completion loop
```bash
# keyword: ooo ralph
ouroboros run workflow seed.yaml     # run → verify → adjust → repeat
ouroboros run resume                 # resume last paused execution
```

Loop contract:
1. execute
2. verify (mechanical + semantic)
3. record failure evidence
4. adjust
5. continue until verified or capped

### Evolve — continuous refinement
Runs when the ontology or solution shape is still changing.

```bash
ouroboros run workflow seed.yaml    # evolve loop runs automatically
```

Stop condition: convergence similarity ≥ 0.95

### Cancel
```bash
ouroboros cancel execution <id>
ouroboros cancel execution --all
ouroboros cancel execution --reason "requirements changed"
```

### Config
```bash
ouroboros config show
ouroboros config show orchestrator
ouroboros config backend claude
ouroboros config backend codex
ouroboros config set orchestrator.permission_mode allowedTools
ouroboros config validate
```

### Status & TUI
```bash
ouroboros status health
ouroboros status executions -n 20
ouroboros tui monitor              # Textual TUI (Python)
ouroboros tui monitor --backend slt  # native Rust TUI
```

**TUI keyboard shortcuts**
| Key | Screen |
|-----|--------|
| `1` | Dashboard — phase progress, drift meter, cost |
| `2` | Execution — details, timeline, phase outputs |
| `3` | Logs — filterable log viewer |
| `4` | Debug — state inspector, raw events |
| `s` | Session selector |
| `e` | Lineage view |
| `p/r` | Pause / resume |
| `q` | Quit |

## Unstuck mode

When repeated attempts fail, choose a deliberate persona instead of retrying blindly.

| Persona | When |
|---------|------|
| `contrarian` | Repeated similar failures |
| `simplifier` | Too many options / paralysis |
| `researcher` | Missing evidence |
| `hacker` | Need momentum |
| `architect` | Wrong foundation |

Nine agents in the pool: Socratic Interviewer, Ontologist, Seed Architect, Seed Closer, Semantic Evaluator, Consensus Reviewer, Evaluator, QA Judge, plus domain-specific specialists.

## MCP server
```bash
ouroboros mcp serve                           # stdio transport (default)
ouroboros mcp serve --transport sse --port 8080
ouroboros mcp info

# Claude Desktop integration
claude mcp add ouroboros -- uvx --from ouroboros-ai[mcp] ouroboros mcp serve
```

**Available MCP tools**
- `ouroboros_execute_seed` — execute a seed specification
- `ouroboros_session_status` — get session status
- `ouroboros_query_events` — query event history

## Environment variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude backend |
| `OPENAI_API_KEY` | LiteLLM / Codex |
| `OPENROUTER_API_KEY` | OpenRouter |
| `OUROBOROS_AGENT_RUNTIME` | Override runtime |
| `OUROBOROS_LLM_BACKEND` | Override LLM backend |
| `OUROBOROS_AGENT_PERMISSION_MODE` | Permission mode |

## Configuration files

| File | Location |
|------|----------|
| `config.yaml` | `~/.ouroboros/` |
| `credentials.yaml` | `~/.ouroboros/` (chmod 600) |
| `ouroboros.db` | `~/.ouroboros/` — SQLite event store |
| `ouroboros.log` | `~/.ouroboros/logs/` |

## Operating rules

1. **Clarify before coding** — do not move to seed until ambiguity ≤ 0.2
2. **Freeze the seed** — do not rewrite the contract mid-run
3. **Measure drift** against the original seed, not latest chat rationale
4. **Verify before done** — tests, checks, and acceptance criteria matter more than confidence
5. **Treat failure as data** — every failed loop feeds the next attempt
6. **Keep runtime ownership separate** — platform hooks belong in `omc` / `omx` / `ohmg`

## Examples

```bash
# Full spec-first flow
ouroboros init start "build a REST API with auth"
ouroboros run workflow .ouroboros/seeds/seed_<hash>.yaml
ouroboros status executions

# Persistent verified loop (ooo ralph)
ouroboros run workflow seed.yaml
ouroboros run resume

# Monitor progress
ouroboros tui monitor

# Uninstall
ouroboros uninstall --keep-data
```

Source: [Q00/ouroboros v0.29.0](https://github.com/Q00/ouroboros/tree/v0.29.0) — MIT License
