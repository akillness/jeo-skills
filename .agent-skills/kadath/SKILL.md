---
name: kadath
description: >
  Run KADATH (Kernel for Agentic Darwinian Adaptation, Tooling, and
  Heredity), a Docker-based evolutionary kernel that turns a goal into a
  locked, Architect-authored benchmark, then evolves a population of
  smolagents-based coding agents across epochs: each agent runs in an
  isolated container, gets graded against frozen evidence, and the
  population is culled, mutated, and reproduced generation over generation
  until it converges on the best-performing agent framework for that goal.
  Use when the user wants to propose/approve/run a KADATH evolutionary run,
  check a run's status or live dashboard, pause/resume/continue a run,
  export the winning agent population, or understand its
  Architect/Grader/Tweaker/Birther pipeline, evidence-freezing, or genome
  lineage/memory model. Triggers on: "kadath", "kadath.sh", "evolve an
  agent", "Darwinian agent evolution", "agent population fitness
  benchmark", "smolagents evolutionary run", "kadath dashboard", "genome
  lineage", "epoch champions".

allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Requires Docker Engine plus the Docker Compose plugin, an OpenAI API key, and a host with a real
  TTY for the interactive `./kadath.sh` frontend (non-interactive automation uses the `kadath`
  CLI directly). Python 3.11+ backs the `kadath` package declared in `pyproject.toml`. Apache-2.0
  license.
metadata:
  tags: kadath, evolutionary-agents, smolagents, multi-agent, agent-benchmarking, docker, llm-agents, genetic-algorithm, python
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/i3T4AN/KADATH
---

# KADATH — evolutionary agent kernel

KADATH takes a goal and spends model tokens evolving agents that get progressively better at
achieving it. A population of `smolagents`-based `CodeAgent` organisms competes each epoch,
gets independently graded against a locked, Architect-authored benchmark, and is then culled,
reflected on, mutated, and reproduced — generation over generation — under a kernel that owns
the run, containers, evidence freezing, grading formulas, and Git-backed genome lineage. The
organisms are read-only while an epoch runs and can only change during the post-grade mutation
phase, so improvement happens through repeated competition and selection rather than one prompt
or one agent.

## When to use this skill

- Standing up a new KADATH run: proposing a goal, letting the Architect draft a benchmark, and
  approving it (`kadath init`/`kadath start`/`kadath approve`)
- Launching, pausing, resuming, or continuing an evolutionary run, or watching its live dashboard
- Exporting a finished run's winning agent population, or continuing evolution from one specific
  historical genome
- Explaining or debugging KADATH's Architect/Grader/Tweaker/Birther pipeline, evidence-freezing,
  container isolation, or memory/heredity model to a user working in this codebase
- Running the read-only local Docker stack (`kadath.sh`) that provides PostgreSQL, MinIO,
  LiteLLM, SearXNG, and Playwright MCP for a run

## When not to use this skill

- Building or fine-tuning a single agent by hand with no evolutionary/competitive-selection
  element → use a normal agent-framework or fine-tuning skill instead
- Generic multi-agent orchestration without grading, culling, and reproduction across generations
  → KADATH's whole value is the selection loop, not just running agents in parallel
- The user wants a lightweight, no-Docker local script → KADATH's control plane requires Docker
  Compose (PostgreSQL, MinIO, LiteLLM) and is not designed to run bare

## Instructions

### Step 1: Clone and read the operational contract first

```bash
git clone https://github.com/i3T4AN/KADATH.git
cd KADATH
```

Read `README.md` fully before running anything — it documents the two-layer design (kernel vs.
organisms), the Architect's machine-readable benchmark contract, isolation/credential rules, and
recovery behavior. `kadath/engine.py` is the run state machine; `kadath/cli.py` is the direct CLI
surface; `seed/organism.py` is the default evolvable agent loop.

### Step 2: Provide credentials and prepare the runtime

```bash
cp .env.example .env   # or let ./kadath.sh generate .kadath/config.env interactively
```

The interactive frontend (`./kadath.sh`) asks for an OpenAI API key and model ID on first launch,
generates PostgreSQL/MinIO/LiteLLM/SearXNG secrets locally, and stores everything in
`.kadath/config.env` with owner-only permissions. It then prepares the Docker images and services.
Requires Docker Engine + the Docker Compose plugin and a real TTY.

### Step 3: Pick the smallest working mode

Use `references/commands.md` for the full command reference. Pick one:

1. **Interactive run** (goal → epoch duration → population → epoch count, with Architect
   approval) → `./kadath.sh`
2. **Non-interactive/scriptable run** → the `kadath` CLI: `kadath init` (propose only) or
   `kadath start` (propose, confirm, approve, launch)
3. **Operate an existing run** → `./kadath.sh status|dashboard|pause|resume|export RUN_ID`
4. **Continue evolution from a specific genome** → `kadath continue RUN_ID --genome HASH --epochs N`
5. **Retrieve results** → `kadath export RUN_ID`, then read
   `.kadath/exports/RUN_ID/final-population/`

Do not jump straight to `./kadath.sh` on real hardware/spend before confirming the Architect's
proposed benchmark (score range, rubric weights, evidence requirements) looks right — declining
approval leaves the run inactive with no cost.

### Step 4: Approve the benchmark before any organisms run

Every run needs an Architect-authored benchmark approved before generation one starts. The
approval screen (or `kadath init`'s JSON proposal) shows the objective, metric, rubric weights
(must total exactly 100%), required evidence, automatic-failure rules, anti-fraud checks, and
enabled tools. Approving locks hashes of the objective, Architect output, tool manifest, and
runtime configuration — editing any locked input after approval stops the run instead of silently
changing the experiment.

### Step 5: Monitor an epoch, then read graded results, not live workspaces

```bash
./kadath.sh dashboard RUN_ID --watch
kadath status RUN_ID
```

The Grader only ever reviews the frozen evidence boundary captured after execution stops (candidate
output, workspace files, artifacts, model-call traces) — never an organism's live workspace.
Agent self-reported scores are always ignored; the kernel computes the final score from the
Grader's extracted facts and the locked rubric formulas.

### Step 6: Export and retrieve the winning agents

```bash
./kadath.sh export RUN_ID
```

Winning agent frameworks land in `.kadath/exports/RUN_ID/final-population/`, one complete runnable
directory per agent. `epoch-champions/records.json` names the winner of each epoch;
`leaderboards/records.json` has the full ranking; `top-historical-genomes/records.json` indexes
strong agents that did not survive to the final population but remain recoverable from the
exported `git-repository/`.

### Step 7: Recover, pause, or clean up safely

- `./kadath.sh pause RUN_ID` — stops after the current durable epoch boundary; resumable.
- An interrupted epoch restores the pre-epoch snapshot and discards partial scores automatically.
- `./kadath.sh reset RUN_ID --yes` removes one run's containers, rows, artifacts, and directory;
  verified exports are intentionally preserved outside the run directory.
- `./kadath.sh cleanup --older-than-days 30` (or `--all`) removes finished-run history only;
  active/paused/awaiting-approval runs are always protected.

## Best practices

1. **Never skip Architect approval** — the locked benchmark hashes are what make a run's results
   trustworthy; approving without reading the rubric defeats the point of the gate.
2. **Read status/dashboard before assuming a run is stuck** — KADATH's failure model treats
   execution, grading, and selection as separate durable boundaries with automatic crash restart
   and snapshot rollback, so most "stuck" runs are mid-recovery, not broken.
3. **Trust the frozen evidence boundary, not the live workspace** — if a user asks "why did agent
   X score low", point them at the exported/frozen attempt, not the organism's still-running
   container.
4. **Treat generation-one identically-seeded organisms as intentional** — every genome starts from
   the same vendored `smolagents` framework; the Birther's system-prompt variation is what makes
   them distinct, so don't "fix" apparent early-generation similarity.
5. **Only the control container touches Docker/credentials** — never suggest passing the Docker
   socket, database credentials, or the LiteLLM master key into an organism/worker container; that
   would break KADATH's isolation model documented in `README.md`.
6. **Export before reset** — `reset` deletes a run's live state; verified exports are the durable
   record, so export first if the winning population needs to be kept.

## References

- [references/commands.md](references/commands.md) — curated `kadath` CLI and `kadath.sh` command
  reference by workflow stage
- [KADATH GitHub Repository](https://github.com/i3T4AN/KADATH)
- [smolagents (Hugging Face)](https://github.com/huggingface/smolagents) — the vendored organism
  framework KADATH evolves
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Start an interactive evolutionary run and watch it

```bash
git clone https://github.com/i3T4AN/KADATH.git
cd KADATH
cp .env.example .env
./kadath.sh
# follow the prompts: OpenAI key, model, goal, epoch duration, population size, epoch count
# review and approve the Architect's proposed benchmark
./kadath.sh dashboard RUN_ID --watch
```

### Example 2: Scriptable run via the direct CLI, then export

```bash
kadath start --goal "write a correct, tested rate limiter library" \
  --epochs 5 --population 20 --epoch-seconds 1800 --executor docker
kadath status RUN_ID
kadath export RUN_ID
ls .kadath/exports/RUN_ID/final-population/
```

### Example 3: Continue evolution from a strong historical genome

```bash
kadath continue RUN_ID --genome GENOME_HASH --epochs 3
kadath approve NEW_RUN_ID
kadath run NEW_RUN_ID --dashboard
```
