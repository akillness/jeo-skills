# Ouroboros Commands — Full Reference

> Complete syntax, parameters, output formats, and state schemas for all `ooo` commands.

---

## ooo interview

**Purpose:** Socratic questioning to expose hidden assumptions before writing code.

**Syntax:**
```
ooo interview "topic"
ooo interview "topic" --brownfield   # existing codebase context
```

**What happens:**
1. Agent: `ouroboros:socratic-interviewer` activates
2. Asks structured questions across all clarity dimensions
3. Scores ambiguity after each round
4. Continues until Ambiguity ≤ 0.2

### Ambiguity Scoring

| Dimension | Greenfield | Brownfield | What it measures |
|-----------|:----------:|:----------:|-----------------|
| Goal Clarity | 40% | 35% | Is the goal specific and bounded? |
| Constraint Clarity | 30% | 25% | Are limitations explicitly defined? |
| Success Criteria | 30% | 25% | Are outcomes measurable? |
| Context Clarity | — | 15% | Is the existing codebase understood? |

**Formula:**
```
Ambiguity = 1 − Σ(clarityᵢ × weightᵢ)

Example (Greenfield):
  Goal: 0.9 × 0.4 = 0.36
  Constraint: 0.8 × 0.3 = 0.24
  Success: 0.7 × 0.3 = 0.21
                      ──────
  Clarity = 0.81
  Ambiguity = 1 − 0.81 = 0.19 ≤ 0.2 → ✓ Ready for Seed
```

Scores are assigned by the LLM at temperature 0.1 for reproducibility.

---

## ooo seed

**Purpose:** Crystallize interview answers into an immutable YAML specification.

**Syntax:**
```
ooo seed
ooo seed --output seed.yaml   # explicit output path
```

**Requires:** Ambiguity ≤ 0.2 (blocks otherwise)

**Output format:**
```yaml
goal: <specific goal from interview>
constraints:
  - <constraint 1>
  - <constraint 2>
acceptance_criteria:
  - <measurable criterion 1>
  - <measurable criterion 2>
ontology_schema:
  name: <domain name>
  fields:
    - name: <field>
      type: <type>
```

**Important:** Once generated, the seed is **immutable**. All drift is measured against it.

---

## ooo run

**Purpose:** Execute the seed specification via Double Diamond decomposition.

**Syntax:**
```
ooo run
ooo run seed.yaml
ooo run seed.yaml --skip-discover   # skip research phase
```

**Phases:**
| Phase | What Happens |
|-------|-------------|
| Discover | Research existing patterns, constraints, precedents |
| Define | Ontological clarity, edge cases, decision boundaries |
| Design | Architecture, component breakdown, interface contracts |
| Deliver | Implementation, tests, documentation |

---

## ooo evaluate

**Purpose:** 3-stage verification gate against seed acceptance criteria.

**Syntax:**
```
ooo evaluate <session_id>
ooo evaluate   # evaluates most recent session
ooo evaluate --skip-consensus   # skip frontier model stage
```

### 3-Stage Gate

| Stage | Cost | What It Checks |
|-------|------|----------------|
| **Mechanical** | Free | Lint, build, tests, coverage, type checks |
| **Semantic** | Standard | AC compliance, goal alignment, drift score |
| **Consensus** | Frontier (optional) | Multi-model vote, majority ratio ≥ 0.6 |

### Drift Thresholds

| Score | Status | Meaning |
|-------|--------|---------|
| `0.0 – 0.15` | Excellent | On track; no corrective action |
| `0.15 – 0.30` | Acceptable | Monitor closely; watch for creep |
| `0.30+` | Exceeded | Course correction required before continuing |

**Drift formula:** `Goal(50%) + Constraint(30%) + Ontology(20%)`

---

## ooo evolve

**Purpose:** Evolutionary loop until ontology converges (Similarity ≥ 0.95).

**Syntax:**
```
ooo evolve "topic"
ooo evolve "topic" --no-execute         # ontology-only fast mode
ooo evolve --status <lineage_id>        # check lineage status
ooo evolve --rewind <lineage_id> <gen>  # roll back to generation N
```

### Convergence Formula

```
Similarity = 0.5 × name_overlap + 0.3 × type_match + 0.2 × exact_match
Threshold: Similarity ≥ 0.95 → CONVERGED
```

### Stagnation Signals

| Signal | Condition | Response |
|--------|-----------|----------|
| Stagnation | Similarity ≥ 0.95 for 3 consecutive gens | Stop — converged |
| Oscillation | Gen N ≈ Gen N-2 | Invoke `contrarian` |
| Repetitive feedback | ≥ 70% question overlap across 3 gens | Invoke `researcher` |
| Hard cap | 30 generations reached | Stop — safety valve |

---

## ooo ralph

**Purpose:** Persistent loop until verification passes — the boulder never stops.

**Syntax:**
```
ooo ralph "task"
ooo ralph "task" --max-iterations=15
ooo ralph "task" --completion-promise=VERIFIED
ooo ralph continue   # resume from checkpoint
```

### State File Schema

Location: `.omc/state/ralph-ooo-state.json`

```json
{
  "mode": "ralph-ooo",
  "session_id": "uuid-v4",
  "request": "original user request",
  "status": "running | complete | failed | cancelled",
  "iteration": 0,
  "max_iterations": 10,
  "last_checkpoint": null,
  "seed_path": "path/to/seed.yaml or null",
  "verification_history": [
    {
      "iteration": 1,
      "passed": false,
      "score": 0.65,
      "issues": ["3 tests failing", "type error in api.py"],
      "timestamp": "2026-03-23T12:00:00Z"
    }
  ]
}
```

### Completion Promise

Codex and Gemini detect loop completion via XML in the output:

```xml
<promise>DONE</promise>
```

- Default promise value: `DONE`
- Default max iterations: `10`
- Custom promise: `--completion-promise=MY_SIGNAL`

### Progress Report Format

```
[Ralph-OOO Iteration N/max]
Executing in parallel...

Verification: FAILED | PASSED
Score: 0.0 – 1.0
Issues:
  - <issue 1>
  - <issue 2>

The boulder never stops. Continuing...
```

---

## ooo unstuck

**Purpose:** Activate a lateral thinking persona to break through stagnation.

**Syntax:**
```
ooo unstuck
ooo unstuck simplifier
ooo unstuck hacker
ooo unstuck contrarian
ooo unstuck researcher
ooo unstuck architect
```

See [nine-minds.md](./nine-minds.md) for full agent profiles.

---

## ooo status

**Purpose:** Drift detection and session health check.

**Syntax:**
```
ooo status
ooo status <session_id>
```

**Output:**
```
Session: <id>
Iteration: 3/10
Drift Score: 0.18 (Acceptable)
  Goal: 0.12
  Constraint: 0.22
  Ontology: 0.21
Last Checkpoint: iteration_3
Status: running
```

---

## ooo setup

**Purpose:** One-time MCP server registration.

```
ooo setup
```

Required before using `ooo run`, `ooo evaluate`, `ooo evolve`, `ooo status`.
Adds Ouroboros reference block to project CLAUDE.md.

---

## ooo cancel

**Purpose:** Clean exit from running loops.

```
/ouroboros:cancel              # save checkpoint, exit cleanly
/ouroboros:cancel --force      # clear all state, force exit
/ralph-ooo:cancel              # alias
ooo cancel                     # within conversation
```

---

## Codex-Specific: ralph loop contract

```
/ralph "task" [--completion-promise=TEXT] [--max-iterations=N]
```

1. Keep original task unchanged across all retries
2. Detect completion: `<promise>VALUE</promise>` in output
3. If promise missing and iteration < max → continue immediately
4. If promise found or max reached → finish with status report
5. State file updated each iteration at `.omc/state/ralph-ooo-state.json`
