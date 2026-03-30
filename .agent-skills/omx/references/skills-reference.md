# OMX Skills Reference (v0.11.10)

All skills are invoked inside Codex with `$skill-name` prefix.

---

## Core Workflow Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `autopilot` | `$autopilot` | Full autonomous pipeline — idea to working code |
| `ralph` | `$ralph` | Persistent execute→verify→fix loop until complete |
| `ultrawork` | `$ulw` | Maximum parallelism across agents |
| `team` | `$team N:role "task"` | N coordinated agents with tmux/worktree isolation |
| `plan` | `$plan "task"` | Strategic planning before implementation |
| `ralplan` | `$ralplan "task"` | Consensus-based iterative planning |
| `pipeline` | `$pipeline` | Sequential staged processing |
| `swarm` | `$swarm` | Parallel agent swarm (alias for ultrawork) |

## Clarification / Interview Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `deep-interview` | `$deep-interview "topic"` | Socratic one-question-at-a-time clarification |
| `deepsearch` | `$deepsearch "query"` | Deep codebase-focused search |
| `analyze` | `$analyze "topic"` | Evidence-driven causal analysis (trace methodology) |

## Code Quality Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `code-review` | `$code-review` | Multi-dimension comprehensive code review |
| `security-review` | `$security-review` | Security audit — vulnerabilities, trust boundaries |
| `ultraqa` | `$ultraqa` | Maximum parallelism QA pass |
| `tdd` | `$tdd` | Test-first development (red-green-refactor cycle) |
| `build-fix` | `$build-fix` | Fix build errors, type errors, toolchain failures |
| `ai-slop-cleaner` | `$ai-slop-cleaner` | Clean AI expression patterns from code/docs |

## Design / UI Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| `visual-verdict` | `$visual-verdict` | UI/UX visual review with pass/fail verdict |
| `frontend-ui-ux` | `$frontend-ui-ux` | Frontend UI/UX design and implementation guidance |
| `web-clone` | `$web-clone` | Clone and adapt web UI patterns |

## Cross-Model Consultation

| Skill | Trigger | Description |
|-------|---------|-------------|
| `ask-claude` | `$ask-claude "prompt"` | Consult Claude for second opinion |
| `ask-gemini` | `$ask-gemini "prompt"` | Consult Gemini for large-context analysis |

## Git & Operations

| Skill | Trigger | Description |
|-------|---------|-------------|
| `git-master` | `$git-master` | Atomic commits, rebasing, history management |
| `trace` | `$trace` | Evidence-driven execution tracing |
| `note` | `$note "text"` | Save working note to `.omx/notes/` |
| `ecomode` | `$ecomode` | Token-efficient low-cost execution mode |

## Setup / Management

| Skill | Trigger | Description |
|-------|---------|-------------|
| `omx-setup` | `$omx-setup` | Re-run setup wizard inside Codex |
| `doctor` | `$doctor` | Run diagnostics |
| `help` | `$help` | Browse available skills |
| `skill` | `$skill` | Manage local skills |
| `cancel` | `$cancel` | Stop active execution modes |
| `configure-notifications` | `$configure-notifications` | Set up OpenClaw/notification gateway |
| `hud` | `$hud` | Configure status bar HUD |
| `worker` | `$worker` | Configure worker behavior |
| `review` | `$review` | Quick review skill |
| `ralph-init` | `$ralph-init` | Initialize Ralph state |

---

## State Persistence

Skills store state in `.omx/`:

```
.omx/
├── state/          # Active mode state (ralph, team, plan)
├── plans/          # Planning artifacts
├── logs/           # Execution logs
├── notes/          # Working notes ($note)
└── memory/         # Long-running session memory
```

---

## Skill Composition

Skills can combine:
- `$ralph` wraps `$ultrawork` — ralph activates parallelism automatically
- `$deep-interview` gates `$plan`/`$ralph`/`$team` — interview first, then hand off
- `$ralplan` feeds into `$ralph` — consensus plan then execute
