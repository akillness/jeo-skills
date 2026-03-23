---
name: ralph
description: "Ouroboros specification-first AI development — the complete system. Socratic interviewing crystallizes vague ideas into immutable specs (Ambiguity ≤ 0.2) before any code is written. Nine Minds agents (socratic-interviewer, ontologist, seed-architect, evaluator, contrarian, hacker, simplifier, researcher, architect) execute the Double Diamond. Ralph mode loops with state persistence until verification passes — the boulder never stops. Use when user says \"ralph\", \"ooo\", \"ooo interview\", \"ooo seed\", \"ooo run\", \"ooo evaluate\", \"ooo evolve\", \"ooo unstuck\", \"ooo status\", \"ooo ralph\", \"stop prompting\", \"start specifying\", \"specification first\", \"socratic interview\", \"don't stop\", \"must complete\", \"keep going\", or \"the boulder never stops\"."
allowed-tools: Read Write Bash Grep Glob WebFetch Agent
metadata:
  tags: ralph, ouroboros, specification-first, socratic, interview, seed, evaluate, evolve, loop, completion, nine-minds, double-diamond, convergence, drift, boulder, ooo, multi-platform
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode
  keyword: ralph
  version: 4.0.0
  source: Q00/ouroboros
  license: MIT
---

# ralph (Ouroboros) — Specification-First AI Development

> **Stop prompting. Start specifying.**
>
> *"The beginning is the end, and the end is the beginning."*
> The serpent doesn't repeat — it evolves.
>
> *Most AI coding fails at the input, not the output. Ouroboros fixes the human, not the machine.*

---

## When to use this skill

- **Before writing any code** — expose hidden assumptions with Socratic interviewing (Ambiguity ≤ 0.2 required)
- **Vague requirements** — crystallize into an immutable YAML seed spec before touching the keyboard
- **Long-running tasks** needing autonomous iteration until verified completion
- **Guaranteed completion tasks** — Ralph loop persists across session boundaries until verification passes
- **When stuck** — Nine Minds lateral thinking personas break through stagnation
- **Drift detection** — measure deviation from original seed and course-correct before it's too late
- **Ontology convergence** — evolutionary loop runs until consecutive generations are ≥ 0.95 similar

---

## Core Architecture: The Ouroboros Loop

```
    Interview → Seed → Execute → Evaluate
        ↑                           ↓
        └──── Evolutionary Loop ────┘
```

Each cycle **evolves**, not repeats. Evaluation output feeds back as input for the next generation until the system converges.

### Double Diamond

```
    ◇ Wonder          ◇ Design
   ╱  (diverge)      ╱  (diverge)
  ╱    explore      ╱    create
 ╱                 ╱
◆ ──────────── ◆ ──────────── ◆
 ╲                 ╲
  ╲    define       ╲    deliver
   ╲  (converge)     ╲  (converge)
    ◇ Ontology        ◇ Evaluation
```

**First diamond (Socratic):** diverge into questions → converge into ontological clarity.
**Second diamond (Pragmatic):** diverge into design options → converge into verified delivery.

You cannot design what you haven't understood. The first diamond is a prerequisite for the second.

---

## Commands

| Command | Triggers | What It Does |
|---------|----------|--------------|
| `ooo interview` | `ooo interview`, `interview me`, `clarify requirements`, `socratic questioning` | Socratic questioning until Ambiguity ≤ 0.2 |
| `ooo seed` | `ooo seed`, `crystallize`, `generate seed`, `freeze requirements` | Crystallize into immutable YAML spec |
| `ooo run` | `ooo run`, `execute seed`, `ouroboros run` | Execute via Double Diamond |
| `ooo evaluate` | `ooo evaluate`, `3-stage check`, `evaluate this` | 3-stage gate: Mechanical → Semantic → Consensus |
| `ooo evolve` | `ooo evolve`, `evolutionary loop`, `iterate until converged` | Evolutionary loop until Similarity ≥ 0.95 |
| `ooo unstuck` | `ooo unstuck`, `I'm stuck`, `think sideways`, `lateral thinking` | Nine Minds lateral thinking personas |
| `ooo status` | `ooo status`, `am I drifting?`, `drift check` | Drift detection + session tracking |
| `ooo ralph` | `ooo ralph`, `ralph-ooo`, `don't stop`, `must complete`, `keep going` | Persistent loop until verified |
| `ooo setup` | `ooo setup` | Register MCP server (one-time) |
| `ooo cancel` | `/ouroboros:cancel`, `/ralph-ooo:cancel` | Save checkpoint and exit |

---

## Phase 1: Interview — From Wonder to Ontology

> *Wonder → "How should I live?" → "What IS 'live'?" → Ontology* — Socrates

The Socratic Interviewer asks questions until **Ambiguity ≤ 0.2**. This is the gate between vague desire and executable spec.

```
ooo interview "I want to build a task management CLI"
```

### Ambiguity Formula

```
Ambiguity = 1 − Σ(clarityᵢ × weightᵢ)

Greenfield: Goal(40%) + Constraint(30%) + Success(30%)
Brownfield: Goal(35%) + Constraint(25%) + Success(25%) + Context(15%)

Threshold: Ambiguity ≤ 0.2 → ready for Seed
```

**Example scoring:**
```
Goal:       0.9 × 0.4 = 0.36   # "Build a CLI task manager" — clear
Constraint: 0.8 × 0.3 = 0.24   # "Python 3.14+, SQLite only" — defined
Success:    0.7 × 0.3 = 0.21   # "Tasks create/list/complete" — measurable
                      ──────
Clarity             = 0.81
Ambiguity = 1 − 0.81 = 0.19 ≤ 0.2 → ✓ Ready for Seed
```

Why 0.2? At 80% weighted clarity, remaining unknowns are small enough for code-level decisions to resolve. Above that threshold, you're still guessing at architecture.

---

## Phase 2: Seed — Immutable Specification

```
ooo seed
```

Generates YAML spec locked from interview answers:

```yaml
goal: Build a CLI task management tool
constraints:
  - Python 3.14+
  - No external database
  - SQLite for persistence
acceptance_criteria:
  - Tasks can be created with title and priority
  - Tasks can be listed with status filter
  - Tasks can be marked complete
ontology_schema:
  name: TaskManager
  fields:
    - name: tasks
      type: array
    - name: title
      type: string
    - name: priority
      type: enum[low, medium, high]
    - name: status
      type: enum[open, done]
```

**The seed is immutable.** Once generated, it is the ground truth. Drift is measured against it.

---

## Phase 3: Execute — Double Diamond Run

```
ooo run seed.yaml
ooo run   # uses seed from conversation context
```

Executes the four phases:
1. **Discover** — research existing patterns, constraints, precedents
2. **Define** — ontological clarity, edge cases, decision boundaries
3. **Design** — architecture, component breakdown, interface contracts
4. **Deliver** — implementation, tests, documentation

---

## Phase 4: Evaluate — 3-Stage Verification Gate

```
ooo evaluate <session_id>
```

| Stage | Cost | What It Checks |
|-------|------|----------------|
| **Mechanical** | Free | Lint, build, tests, coverage, type checks |
| **Semantic** | Standard | AC compliance, goal alignment, drift score |
| **Consensus** | Frontier (optional) | Multi-model vote, majority ratio |

### Drift Thresholds

| Score | Status | Action |
|-------|--------|--------|
| `0.0 – 0.15` | Excellent | On track |
| `0.15 – 0.30` | Acceptable | Monitor closely |
| `0.30+` | Exceeded | Course correction required |

Drift = weighted deviation from seed across three axes: Goal(50%) + Constraint(30%) + Ontology(20%).

---

## Phase 5: Evolve — Ontological Convergence

```
ooo evolve "build a task management CLI"
ooo evolve "topic" --no-execute   # ontology-only fast mode
```

### Flow

```
Gen 1: Interview → Seed(O₁) → Execute → Evaluate
Gen 2: Wonder → Reflect → Seed(O₂) → Execute → Evaluate
Gen 3: Wonder → Reflect → Seed(O₃) → Execute → Evaluate
...until Similarity ≥ 0.95 or 30 generations
```

### Convergence Formula

```
Similarity = 0.5 × name_overlap + 0.3 × type_match + 0.2 × exact_match
Threshold: Similarity ≥ 0.95 → CONVERGED

Gen 1: {Task, Priority, Status}                     → baseline
Gen 2: {Task, Priority, Status, DueDate}            → similarity 0.78 → CONTINUE
Gen 3: {Task, Priority, Status, DueDate}            → similarity 1.00 → CONVERGED ✓
```

### Stagnation Detection

| Signal | Condition | Response |
|--------|-----------|----------|
| **Stagnation** | Similarity ≥ 0.95 for 3 consecutive gens | Stop — converged |
| **Oscillation** | Gen N ≈ Gen N-2 (period-2 cycle) | Invoke `contrarian` persona |
| **Repetitive feedback** | ≥ 70% question overlap across 3 gens | Invoke `researcher` persona |
| **Hard cap** | 30 generations reached | Stop — safety valve |

---

## Ralph — Persistent Loop Until Verified

```
ooo ralph "fix all failing tests"
ooo ralph "implement the payment module"
```

**"The boulder never stops."**
Each failure is data for the next attempt. Only verified success or max iterations stops it.

### Loop Architecture

```
┌─────────────────────────────────────┐
│  1. EXECUTE (parallel agents)       │
│     Fire independent sub-tasks      │
│     concurrently via Agent tool     │
├─────────────────────────────────────┤
│  2. VERIFY                          │
│     Check acceptance criteria       │
│     Run tests, lint, typecheck      │
│     Measure drift vs seed           │
├─────────────────────────────────────┤
│  3. LOOP (if failed)                │
│     Analyze failure evidence        │
│     Fix identified issues           │
│     Increment iteration counter     │
│     Repeat from step 1              │
├─────────────────────────────────────┤
│  4. PERSIST (each iteration)        │
│     .omc/state/ralph-ooo-state.json │
│     Resume after interruption       │
└─────────────────────────────────────┘
```

### State File Schema

Create `.omc/state/ralph-ooo-state.json` on start:

```json
{
  "mode": "ralph-ooo",
  "session_id": "<uuid>",
  "request": "<user request>",
  "status": "running",
  "iteration": 0,
  "max_iterations": 10,
  "last_checkpoint": null,
  "seed_path": null,
  "verification_history": []
}
```

### Loop Logic (Pseudocode)

```python
while iteration < max_iterations:
    result = execute_parallel(request, context)
    verification = verify_result(result, acceptance_criteria)
    state.verification_history.append({
        "iteration": iteration,
        "passed": verification.passed,
        "score": verification.score,
        "timestamp": now()
    })
    save_checkpoint(f"iteration_{iteration}")
    if verification.passed:
        save_checkpoint("complete")
        break
    iteration += 1
```

### Progress Report Format

```
[Ralph-OOO Iteration 1/10]
Executing in parallel...

Verification: FAILED
Score: 0.65
Issues:
  - 3 tests still failing
  - Type error in src/api.py:42

The boulder never stops. Continuing...

[Ralph-OOO Iteration 3/10]
Verification: PASSED ✓
Score: 1.0

Ralph-OOO COMPLETE
==================
Request: Fix all failing tests
Duration: 8m 32s
Iterations: 3
Verification History:
  - Iteration 1: FAILED (0.65)
  - Iteration 2: FAILED (0.85)
  - Iteration 3: PASSED (1.0)
```

### Completion Promise (Codex / Gemini)

```xml
<promise>DONE</promise>
```

Default promise: `DONE` | Default max iterations: `10`

### Cancellation

| Action | Command |
|--------|---------|
| Save checkpoint & exit | `/ouroboros:cancel` or `/ralph-ooo:cancel` |
| Force clear all state | `/ouroboros:cancel --force` |
| Resume after interruption | `ooo ralph continue` |

---

## The Nine Minds

Loaded on-demand — never preloaded. Each mind has a single core question it cannot stop asking.

| Agent | Role | Core Question |
|-------|------|--------------|
| **Socratic Interviewer** | Questions-only. Never builds. | *"What are you assuming?"* |
| **Ontologist** | Finds essence, not symptoms | *"What IS this, really?"* |
| **Seed Architect** | Crystallizes specs from dialogue | *"Is this complete and unambiguous?"* |
| **Evaluator** | 3-stage verification | *"Did we build the right thing?"* |
| **Contrarian** | Challenges every assumption | *"What if the opposite were true?"* |
| **Hacker** | Finds unconventional paths | *"What constraints are actually real?"* |
| **Simplifier** | Removes complexity | *"What's the simplest thing that could work?"* |
| **Researcher** | Stops coding, starts investigating | *"What evidence do we actually have?"* |
| **Architect** | Identifies structural causes | *"If we started over, would we build it this way?"* |

See [references/nine-minds.md](./references/nine-minds.md) for full agent profiles.

---

## Unstuck — Lateral Thinking

When blocked after repeated failures:

```
ooo unstuck                  # auto-select based on context
ooo unstuck simplifier       # cut scope to MVP
ooo unstuck hacker           # make it work first, elegance later
ooo unstuck contrarian       # challenge all assumptions
ooo unstuck researcher       # stop coding, find missing information
ooo unstuck architect        # restructure the approach entirely
```

**Decision guide:**
- Repeated similar failures → `contrarian` (challenge assumptions)
- Too many options / paralysis → `simplifier` (reduce scope)
- Missing information / unclear root cause → `researcher` (seek evidence)
- Analysis paralysis / need momentum → `hacker` (just make it work)
- Structural issues / wrong foundation → `architect` (redesign)

---

## Quick Reference

| Action | Command |
|--------|---------|
| Socratic interview | `ooo interview "topic"` |
| Generate spec | `ooo seed` |
| Execute spec | `ooo run [seed.yaml]` |
| 3-stage evaluate | `ooo evaluate <session_id>` |
| Evolve until converged | `ooo evolve "topic"` |
| Persistent loop | `ooo ralph "task"` |
| Break stagnation | `ooo unstuck [persona]` |
| Check drift | `ooo status [session_id]` |
| First-time setup | `ooo setup` |
| Cancel | `/ouroboros:cancel` |
| Force cancel | `/ouroboros:cancel --force` |
| Resume | `ooo ralph continue` |

---

## Available Scripts

Run from the skill directory:

| Script | Purpose |
|--------|---------|
| `scripts/setup-codex-hook.sh` | Configure Codex CLI for ralph-ooo (developer_instructions + prompts) |
| `scripts/setup-gemini-hook.sh` | Configure Gemini CLI AfterAgent hook for loop continuation |
| `scripts/ooo-state.sh` | Manage `.omc/state/ralph-ooo-state.json` (init/status/checkpoint/reset/resume) |

---

## Platform Support Matrix

| Platform | Support | Mechanism | ooo Commands | Auto Loop |
|----------|---------|-----------|-------------|-----------|
| **Claude Code** | Full | Skills system + hooks | All `ooo` commands | Via hooks |
| **Codex CLI** | Adapted | bash loop + `/prompts:ralph-ooo` | Via conversation | Manual state file |
| **Gemini CLI** | Native | AfterAgent hook | All `ooo` commands | Via hook |
| **OpenCode** | Native | Skills system | All `ooo` commands | Via loop |

---

## Installation

```bash
# Claude Code (via oh-my-skills)
npx skills add https://github.com/akillness/oh-my-skills --skill ralph-ooo

# Codex CLI setup
bash .agent-skills/ralph-ooo/scripts/setup-codex-hook.sh

# Gemini CLI setup
bash .agent-skills/ralph-ooo/scripts/setup-gemini-hook.sh

# Ouroboros native plugin
claude plugin marketplace add Q00/ouroboros
claude plugin install ouroboros@ouroboros
ooo setup
```

---

## References

Detailed documentation in `references/`:

| File | Contents |
|------|---------|
| `references/ouroboros-commands.md` | Full ooo command syntax, parameters, output formats, state schemas |
| `references/nine-minds.md` | All 9 agent profiles, core questions, when to invoke, unstuck guide |
| `references/platform-setup.md` | Per-platform setup, hooks.json, AfterAgent config, Gemini bug workarounds |

---

Source: [Q00/ouroboros](https://github.com/Q00/ouroboros) — MIT License
