# OMC Orchestration Modes Reference

---

## Team (Canonical Mode)

```bash
/oh-my-claudecode:team 3:executor "implement fullstack todo app"
```

5-stage pipeline — agents share a task list:
```
team-plan → team-prd → team-exec → team-verify → team-fix (loop if failed)
```

- `team-plan`: Creates shared task list
- `team-prd`: Architect designs solution and interfaces
- `team-exec`: N parallel executors implement tasks
- `team-verify`: Verifier checks acceptance criteria
- `team-fix`: If failed, loops back to exec

**When to use**: Coordinated multi-agent work where agents should share context.

---

## Autopilot

```bash
autopilot: build a REST API for managing tasks
```

Full autonomous 5-stage pipeline from idea to working code:
1. Deep interview (clarify requirements)
2. Planning (task breakdown)
3. Architecture (system design)
4. Implementation (code generation)
5. Verification (testing & validation)

**When to use**: End-to-end feature work with minimal setup. Single lead agent.

---

## Ralph (Persistence Loop)

```bash
ralph: refactor the authentication module
ralph: fix all failing tests
```

Executes, verifies, fixes — loops until done:
```
execute → verify → fix → repeat (until verified or max iterations)
```

State saved to `.omc/state/ralph.json`. Survives context resets.

**When to use**: Tasks that must complete fully. No partial deliveries accepted.

> ralph includes ultrawork — parallel execution is automatic.

---

## Ultrawork

```bash
ultrawork: implement user authentication with OAuth
ulw fix all errors
```

Maximum parallelism — launch multiple agents simultaneously:
- Independent work streams with no synchronization overhead
- Results merged atomically
- Best for burst fixes/refactors across codebase

**When to use**: Many independent tasks that can run simultaneously.

---

## CCG (3-Model Synthesis)

```bash
ccg: implement payment processing with UI dashboard
```

Synthesizes three models:
- **Codex**: Execution focus, code generation
- **Gemini**: Analysis, large context (1M tokens), design review
- **Claude**: Orchestration, integration, final synthesis

**When to use**: Complex tasks spanning backend execution + UI design + large codebase analysis.

---

## Pipeline

Sequential staged processing with strict ordering:
```
stage-1 → stage-2 → stage-3 → ...
```

**When to use**: Multi-step transformations where each step depends on prior output.

---

## Skill Layer Composition

Skills compose in three layers:

```
GUARANTEE LAYER    ralph (loop until done)
       ↓
ENHANCEMENT LAYER  ultrawork (parallelism) | git-master (commits)
       ↓
EXECUTION LAYER    autopilot | planner | default build
```

**Example combinations:**
- `ultrawork: refactor API with proper commits` = ultrawork + git-master + default
- `ralph: implement full feature` = ralph + ultrawork + autopilot
- Just `autopilot: build X` = autopilot only (no guarantee layer)

---

## Legacy Modes (Deprecated → Route to Team)

| Legacy | Routes to |
|--------|----------|
| `swarm N agents: task` | Team mode |
| `ultrapilot: task` | Team mode |

---

## State Files

| Mode | State File |
|------|-----------|
| Team | `.omc/state/team.json` |
| Autopilot | `.omc/state/autopilot.json` |
| Ralph | `.omc/state/ralph.json` |
| Ultrawork | `.omc/state/ultrawork.json` |

Working memory: `.omc/notepad.md` (7-day auto-prune)
Permanent context: `.omc/project-memory.json`
