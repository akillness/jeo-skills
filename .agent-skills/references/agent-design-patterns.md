# Agent Design Patterns

Reference for harness skill — choose the right execution pattern for your domain.

---

## Execution Modes

### Agent Teams (Default)

Uses `TeamCreate` to assemble independent Claude instances. Team members:
- Communicate directly via `SendMessage`
- Share task lists via `TaskCreate` / `TaskUpdate`
- Work semi-autonomously in parallel

**Use when**: Agents need to cross-validate, share intermediate results, or coordinate without going through an orchestrator.

```
TeamCreate → assign roles → agents run + communicate via SendMessage → orchestrator synthesizes
```

### Sub-agents (Lightweight)

Uses the `Agent` tool. Results flow only back to the calling agent.

**Use when**: Tasks are fully independent and no inter-agent communication is needed.

```
Agent(task1) + Agent(task2) → results return to main agent only
```

---

## Architecture Patterns

### 1. Pipeline

Sequential stages where output feeds the next step.

```
[Stage A] → [Stage B] → [Stage C] → [Output]
```

**Best for**: Design → Code → Review → Deploy, document processing, ETL flows.

**Key rule**: Define clear data contracts between stages. Use `_workspace/stage-{n}-output/` paths.

---

### 2. Fan-out / Fan-in

Parallel independent workers whose outputs are merged by an orchestrator.

```
             ┌→ [Worker A] →┐
[Input] ──── ├→ [Worker B] →┤ ── [Synthesizer] → [Output]
             └→ [Worker C] →┘
```

**Best for**: Multi-angle research, parallel code analysis, competitive landscape scans.

**Key rule**: Workers must not depend on each other. Synthesizer runs after all workers complete.

---

### 3. Expert Pool

Context-dependent dynamic routing to the most appropriate specialist.

```
[Router] ──→ specialist A (if security issue)
         ──→ specialist B (if performance issue)
         ──→ specialist C (if style issue)
```

**Best for**: Code review, customer support routing, domain-specific Q&A.

**Key rule**: Routing criteria must be explicit and deterministic. Specialists may communicate directly for cross-domain issues.

---

### 4. Producer-Reviewer

Generation paired with validation cycles.

```
[Producer] → [Reviewer] → feedback → [Producer] → [Reviewer] → ...
                                                              → PASS
```

**Best for**: Content creation with quality gates, code generation + testing, spec + implementation.

**Key rule**: Define PASS/FIX/REDO criteria explicitly. Set a maximum revision loop (recommended: 2–3).

---

### 5. Supervisor

Central coordinator dynamically assigns work to workers at runtime.

```
[Supervisor]
    ├── assigns task batch to Worker A
    ├── assigns task batch to Worker B
    └── reallocates based on progress
```

**Best for**: Code migrations, large-scale file processing, dynamic workload balancing.

**Key rule**: Workers claim tasks and report completion. Supervisor must handle reassignment when a worker stalls.

---

### 6. Hierarchical Delegation

Top-down recursive decomposition. Maximum 2 levels.

```
[PM / Orchestrator]
    ├── [Tech Lead A] → [Engineer 1] + [Engineer 2]
    └── [Tech Lead B] → [Engineer 3] + [Engineer 4]
```

**Best for**: Large engineering projects with sub-teams, nested domain expertise.

**Key rule**: Never nest beyond 2 levels. Team members cannot create their own teams.

---

## Pattern Selection Guide

| Task type | Recommended pattern |
|-----------|---------------------|
| Sequential dependent stages | Pipeline |
| Parallel independent analysis | Fan-out/Fan-in |
| Domain-specific routing | Expert Pool |
| Generation + quality gate | Producer-Reviewer |
| Dynamic large-scale processing | Supervisor |
| Hierarchical engineering project | Hierarchical Delegation |
| Mixed (parallel + sequential) | Pipeline with Fan-out phases |

---

## Agent Definition Rules

1. All agents must be file-based: `.claude/agents/{name}.md`
2. Embedding roles inline in `Agent` tool prompts is prohibited — file definitions enable session reuse
3. Use `model: opus` as default; `model: sonnet` for lighter tasks
4. Every agent definition must include: `name`, `description`, `model`, `allowed-tools`
5. Recommended sections: Core Responsibilities, Input Protocol, Output Protocol, Error Handling, Team Communication
