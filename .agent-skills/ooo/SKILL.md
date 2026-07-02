---
name: ooo
description: >
  Run the Ouroboros specification-first development loop: reduce ambiguity with a
  Socratic interview grounded in live git data (commits, churn, contributors),
  freeze an immutable seed/spec, render the execution plan through spec-kit
  (/speckit.plan → /speckit.tasks), execute against that contract through
  cli-anything agent-native CLI harnesses (cli-hub, --json evidence), verify
  before claiming success, and keep looping until completion is actually
  verified. Use when the user wants spec-first clarification, git-aware
  interviews, immutable requirements, drift-aware implementation, harness-driven
  execution, or a persistent completion loop that should keep going until tests
  / checks / acceptance criteria pass. Triggers on: ooo, ouroboros, interview,
  seed, run workflow, evaluate, evolve, ooo ralph, specification first, socratic
  interview, git-aware interview, ambiguity reduction, execution plan, cli
  harness execute, persistent completion.
allowed-tools: Read Write Bash Grep Glob WebFetch Agent
metadata:
  tags: ooo, ouroboros, specification-first, socratic, interview, seed, evaluate, evolve, loop, completion, nine-minds, double-diamond, convergence, drift, multi-platform, mcp, plugin, git-aware, spec-kit, execution-planning, cli-anything, cli-hub, harness-execution
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: ooo
  version: 0.29.0
  source: Q00/ouroboros
  license: MIT
---

# ooo — Ouroboros Specification-First Workflow

> Stop prompting. Start specifying.

`ooo` is the **portable Ouroboros method** for spec-first development. The
interview is grounded in **live git data**, the frozen seed is rendered into
an execution plan by **spec-kit**, and the run stage executes through
**cli-anything** agent-native harnesses:

```text
git data (commits · churn · contributors)
        ↓ (regenerated every interview)
Interview → Seed → Plan (spec-kit) → Execute (cli-anything) → Evaluate → Evolve
                     ↓                                            ↑
                 ooo ralph                            --json artifact evidence
             (persist until verified)
```

Three bindings make the philosophy concrete:

1. **Git-aware interview** — the Socratic interview scores its brownfield
   Context weighting against `.ouroboros/interview-context.md`, a derived
   file regenerated from the repository's *current* commits, churn hotspots,
   contributors, and working-tree state. The interview philosophy stays
   bound to updated git data, never to stale chat memory.
2. **spec-kit execution planning** — after the seed freezes, GitHub
   spec-kit's `/speckit.plan` → `/speckit.tasks` render the reviewable
   execution plan *from the seed*. The seed stays the contract SSOT;
   spec-kit owns only the plan artifact (direction: seed → plan).
3. **cli-anything execute harnesses** — the run stage drives real software
   through CLI-Hub harnesses (`cli-hub search` → `install` → `launch`)
   instead of brittle GUI automation or bare shell guessing. Every harness
   command supports `--json`; that structured output is the artifact
   evidence the evaluate stage accepts. Name the harnesses in seed
   constraints so tool drift becomes measurable spec drift.

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

### Skill + integrations (recommended, any platform)
```bash
npx skills add https://github.com/akillness/jeo-skills --skill ooo

# One-shot installer: skill + ouroboros-ai + git interview + spec-kit + cli-anything
bash scripts/install.sh
GLOBAL=1 AGENTS="claude-code,codex" bash scripts/install.sh

# Knobs (designate at install time):
#   OOO_GIT_INTERVIEW=0  — skip git-aware interview wiring   (default: on)
#   OOO_SPEC_KIT=0       — skip spec-kit/`specify-cli`        (default: on)
#   OOO_CLI_ANYTHING=0   — skip cli-anything/CLI-Hub          (default: on)
#   SPEC_KIT_REF=v0.0.10 — pin the spec-kit git ref
#   CLI_ANYTHING_HUB_SPEC="cli-anything-hub==0.2.0" — pin CLI-Hub
#   SKIP_PACKAGE=1 / SKIP_SKILL=1 / OOO_EXTRAS=mcp
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
- Interview must be grounded in **updated git data** (commits, churn, contributors), not chat memory
- Requirements should become an **immutable seed/spec** before implementation
- Task needs a **verify-before-done** loop, not a one-shot answer
- You want to **keep going until completion is actually verified**
- Measure **drift** against the original contract
- Repeated failures need structured **unstuck** step instead of blind retries
- The frozen seed should become a **reviewable spec-kit execution plan** before implementation
- Execution must drive **real software through agent-native CLI harnesses** with `--json` artifact evidence

## Do not use when

- Task is mainly platform setup or runtime commands → `omc` / `omx` / `ohmg`
- Task is mainly permission posture, sandbox, trust folders → (configure via `ouroboros setup`)
- Task needs integrated project ledgers + plan review + cleanup workflow → `jeo`
- Task is only pre-implementation landscape research → `survey`
- spec-kit should **author the spec itself** (spec → seed direction, docs as SSOT) → `spec-stack`
- Only **installing or generating a CLI harness**, no seed/loop → `cli-anything`

## Core commands

### Interview — clarify before coding
```bash
ouroboros init start "build a task management CLI"
ouroboros init start --resume <interview-id>
ouroboros init list
```

**Git-aware context (brownfield)** — regenerate before every interview so the
Context score reflects the repo as it is *now*:

```bash
bash scripts/git-interview-context.sh        # → .ouroboros/interview-context.md
OOO_GIT_WINDOW=30 OOO_GIT_TOP=10 bash scripts/git-interview-context.sh
```

The generated file carries branch/HEAD, recent commits, churn hotspots,
active contributors, and working-tree state. It is derived — regenerate it,
never hand-edit it. Churn hotspots become interview questions; a dirty
working tree is a question, not an assumption.

**Ambiguity gate**
- Greenfield: Goal 40% + Constraints 30% + Success 30%
- Brownfield: Goal 35% + Constraints 25% + Success 25% + Context 15%
  — score Context against `.ouroboros/interview-context.md` (live git data)
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

### Plan — render the execution plan (spec-kit)
With `OOO_SPEC_KIT=1` (installer default), the frozen seed is rendered into a
reviewable execution plan before the loop starts:

```bash
specify init . --integration claude    # once per repo (or codex/gemini/...)
# then, inside the agent, from the frozen seed:
#   /speckit.plan   — technical strategy derived from seed goal + constraints
#   /speckit.tasks  — actionable task breakdown for the run stage
```

Plan-stage rules:
- **Direction is one-way: seed → plan.** The seed stays the contract SSOT;
  `plan.md`/`tasks.md` are derived artifacts. If requirements change,
  re-interview and re-freeze the seed first, then re-render the plan.
- `/speckit.implement` is optional sugar per task — completion is still
  gated by the ooo evaluate loop, never by task checkboxes.
- Want the opposite direction (spec-kit authors the spec, docs as SSOT)?
  That is `spec-stack`, not this skill.

### Run — execute against the seed
```bash
ouroboros run workflow <seed.yaml>
ouroboros run workflow <seed.yaml> --sequential
ouroboros run workflow <seed.yaml> --no-qa
ouroboros run resume [execution-id]
```

**Harness-driven execution (cli-anything)** — with `OOO_CLI_ANYTHING=1`
(installer default), the run stage drives real software through agent-native
CLI harnesses instead of GUI automation or bare shell guessing:

```bash
cli-hub search <keyword>      # registry first — 40+ harnesses exist
cli-hub install <name>        # install harness (+ the upstream app)
cli-anything-<name> --json …  # structured output = evaluate-stage evidence
```

Execute-stage rules:
- **Registry before generation** — `cli-hub search` costs seconds; only
  generate a new harness (`/cli-anything <path-or-repo>`) when no match.
- **Name harnesses in seed constraints** (e.g. "image ops go through
  `cli-anything-gimp`") so tool drift becomes measurable spec drift.
- **`--json` output is the evidence** the evaluate stage accepts — verify
  artifacts (magic bytes, structure, pixels), not exit codes.

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
2. **Ground the interview in live git data** — regenerate
   `.ouroboros/interview-context.md` before every interview; churn hotspots
   and working-tree state are questions, not assumptions
3. **Freeze the seed** — do not rewrite the contract mid-run
4. **Plan from the seed, one-way** — spec-kit renders `plan.md`/`tasks.md`
   from the frozen seed; requirement changes go seed-first, then re-render
5. **Measure drift** against the original seed, not latest chat rationale
6. **Verify before done** — tests, checks, and acceptance criteria matter more than confidence
7. **Treat failure as data** — every failed loop feeds the next attempt
8. **Execute through contracted harnesses** — registry first
   (`cli-hub search`), name harnesses in seed constraints, and treat
   harness `--json` output as the evaluate-stage evidence
9. **Keep runtime ownership separate** — platform hooks belong in `omc` / `omx` / `ohmg`

## Examples

```bash
# Full spec-first flow (git interview → seed → spec-kit plan → harness run)
bash scripts/git-interview-context.sh          # refresh live git context
ouroboros init start "build a REST API with auth"
# after seed freeze: /speckit.plan → /speckit.tasks (spec-kit, from the seed)
cli-hub search api && cli-hub install <name>   # arm execute-stage harnesses
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
