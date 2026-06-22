---
name: omx
description: "Use when you need multi-agent orchestration for OpenAI Codex CLI, especially Codex equivalents of Claude `/team`, `/autopilot`, `/ultrawork`, and `/ultraqa`. Triggers on: omx, $plan, $ralph, $team, $ulw, $ultraqa, $autopilot, $deep-interview, $prometheus-strict. v0.18.14 — 30+ agents, 35+ workflow skills, tmux team runtime, sparkshell, explore, ralplan, prometheus-strict, best-practice-research, autoresearch-goal."
allowed-tools: Read Write Bash Grep Glob Edit Agent
metadata:
  tags: omx, oh-my-codex, codex, openai, multi-agent, orchestration, team, autopilot, ultrawork, ultraqa, ralph, plan, deep-interview, ralplan
  platforms: Codex, Claude, Gemini
  keyword: omx
  version: 0.18.14
  source: Yeachan-Heo/oh-my-codex
---


# omx (oh-my-codex) — Multi-Agent Orchestration for Codex CLI

## When to use this skill

- You want a stronger Codex CLI runtime with reusable role prompts and workflow skills
- You need coordinated parallel agents via tmux team workers
- You want Codex/OMX equivalents for Claude `/team`, `/autopilot`, `/ultrawork`, or `/ultraqa`
- Complex tasks requiring persistent execution (`$ralph`) or consensus planning (`$ralplan`)
- You need repository exploration (`omx explore`) or bounded shell inspection (`omx sparkshell`)
- Cross-model consultation with `$ask-claude` or `$ask-gemini`

---

## 1. Quick Start

```bash
npm install -g @openai/codex oh-my-codex
omx setup
omx --madmax --high
```

Inside Codex:
```text
/prompts:architect "analyze the authentication flow"
$plan "map the safest implementation path"
```

> **Mental model**: Codex does the agent work. OMX adds better prompts, reusable workflow skills, and a runtime layer around it. Start with `omx --madmax --high` and let the agent pull in `$team`, `$ralph`, or other workflows when the task needs them.

---

## 2. Agent Roles (30+)

| Tier | Agents |
|------|--------|
| **Core Development** | `architect` · `planner` · `executor` · `debugger` · `verifier` · `explore` |
| **Quality Assurance** | `style-reviewer` · `quality-reviewer` · `api-reviewer` · `security-reviewer` · `performance-reviewer` |
| **Domain Experts** | `dependency-expert` · `test-engineer` · `build-fixer` · `designer` · `writer` · `qa-tester` |
| **Product Strategy** | `product-manager` · `ux-researcher` · `product-analyst` · `information-architect` |

Invoke via: `/prompts:<agent-name> "task"`

---

## 3. Workflow Skills (35+)

| Skill | Trigger | Description |
|-------|---------|-------------|
| `autopilot` | `$autopilot` | Full autonomous pipeline — idea to working code |
| `ralph` | `$ralph` | Persistent execution loop until verified complete |
| `ultrawork` | `$ulw`, `$ultrawork` | Maximum parallelism across independent agents |
| `team` | `$team` | N coordinated agents with tmux/worktree isolation |
| `plan` | `$plan` | Strategic planning before implementation |
| `ralplan` | `$ralplan` | Consensus-based iterative planning |
| `deep-interview` | `$deep-interview` | Socratic clarification before planning or execution |
| `deepsearch` | `$deepsearch` | Codebase-focused deep search |
| `analyze` | `$analyze` | Evidence-driven causal analysis (trace methodology) |
| `tdd` | `$tdd` | Test-first development (red-green-refactor) |
| `build-fix` | `$build-fix` | Fix build errors, type errors, toolchain failures |
| `code-review` | `$code-review` | Comprehensive multi-dimension code review |
| `security-review` | `$security-review` | Security audit — vulnerabilities, trust boundaries |
| `ultraqa` | `$ultraqa` | Maximum parallelism QA/review pass |
| `visual-verdict` | `$visual-verdict` | UI/UX visual review with verdict |
| `frontend-ui-ux` | `$frontend-ui-ux` | Frontend UI/UX design and review |
| `ai-slop-cleaner` | `$ai-slop-cleaner` | Clean AI expression patterns from code/docs |
| `ask-claude` | `$ask-claude` | Cross-model consultation with Claude |
| `ask-gemini` | `$ask-gemini` | Cross-model consultation with Gemini |
| `git-master` | `$git-master` | Atomic commits, rebasing, history management |
| `ecomode` | `$ecomode` | Token-efficient execution mode |
| `web-clone` | `$web-clone` | Clone and adapt web pages or UI patterns |
| `cancel` | `$cancel` | Stop active execution modes |

---

## 4. Team Runtime

```bash
# Start parallel team workers
omx team 3:executor "fix all TypeScript errors"
omx team 2:security-reviewer,1:architect "audit auth module"

# Team management
omx team status <team-name>
omx team resume <team-name>
omx team shutdown <team-name>
```

Inside Codex:
```text
$team 3:executor "parallelize this refactor"
```

**Requirements:**

| Platform | Dependency |
|----------|-----------|
| macOS | `brew install tmux` |
| Ubuntu/Debian | `sudo apt install tmux` |
| Fedora | `sudo dnf install tmux` |
| Windows (native) | `winget install psmux` |
| Windows (WSL2) | `sudo apt install tmux` |

---

## 5. Claude Workflow Parity

Read [references/parallel-quality-workflows.md](references/parallel-quality-workflows.md) when the user asks to use Claude-style `team`, `autopilot`, `ultrawork`, or `ultraqa` from Codex.

| Claude / OMC intent | OMX command | Use when |
|---------------------|-------------|----------|
| `/team N:role "task"` | `$team N:role "task"` or `omx team N:role "task"` | Coordinated work needs a shared task list and isolated workers |
| `/autopilot "task"` or `autopilot: task` | `$autopilot "task"` | End-to-end idea → plan → implementation → verification should stay Codex-native |
| `/ultrawork "task"` | `$ulw "task"` or `$ultrawork "task"` | Independent lanes can run with little synchronization |
| `/ultraqa "target"` | `$ultraqa "target"` | QA/review should fan out across test, security, performance, or UI concerns |

Do not reuse `.omc/state/` from Claude sessions. OMX state and scratch belong under `.omx/`.
For vague greenfield requests, run `$deep-interview` before `$autopilot`. For high-assurance completion loops, use `$plan` or `$ralplan` before `$ralph`.

---

## 6. CLI Commands

### Core launch
```bash
omx                   # Launch Codex with OMX runtime
omx --madmax --high   # Recommended default (bypass + high reasoning)
omx --xhigh           # Extra-high reasoning effort
```

### Launch flags

| Flag | Description |
|------|-------------|
| `--yolo` | Fast execution, minimal verification |
| `--high` | High reasoning effort |
| `--xhigh` | Extra-high reasoning effort |
| `--madmax` | Bypass approvals/sandbox (`--dangerously-bypass-approvals-and-sandbox`) |
| `--dry-run` | Preview without execution |
| `--verbose` | Verbose output |

### Operator commands
```bash
omx setup             # Install prompts, skills, config, AGENTS scaffolding
omx doctor            # Verify installation
omx doctor --team     # Team/swarm diagnostics
omx status            # Show active modes
omx cancel            # Cancel execution modes
omx hud --watch       # Live HUD status monitor
omx reasoning <mode>  # Set: low/medium/high/xhigh
omx help              # Show help
```

### Explore & inspect
```bash
omx explore --prompt "find where team state is written"   # Read-only repo lookup
omx sparkshell git status                                  # Bounded shell inspection
omx sparkshell --tmux-pane %12 --tail-lines 400           # Tail tmux pane output
```

---

## Instructions

1. **Identify intent** — match request to the best workflow skill (`$autopilot`, `$plan`, `$ralph`, `$team`, `$deep-interview`)
2. **Start with the recommended launch** — `omx --madmax --high` for most sessions
3. **Use role prompts for analysis** — `/prompts:architect "..."` before implementation
4. **Escalate when needed** — use `$autopilot` for full autonomous build intent, `$team` for coordinated workers, `$ulw` for independent burst work, and `$ultraqa` for QA fan-out
5. **Use `$deep-interview` for vague requests** — when intent, scope, or boundaries are unclear
6. **Point to references** — link to the relevant references/ file for deep-dive details

---

## Examples

### Example 1: Standard session
```bash
omx --madmax --high
```
```text
/prompts:architect "analyze the current auth flow"
$plan "implement OAuth safely"
```

### Example 2: Persistent execution
```text
$ralph "fix all failing tests and make them pass"
```
Loop: execute → verify → fix, until all tests pass.

### Example 3: Parallel team work
```bash
omx team 3:executor "refactor the API layer with proper tests"
```

### Example 4: Claude ultrawork / ultraqa parity
```text
$autopilot "build the task API end to end"
$ulw "parallelize the independent cleanup tasks"
$ultraqa "review the auth flow across tests, security, and performance"
```

### Example 5: Clarify before coding
```text
$deep-interview "I want to add a payment system"
```
One-question-at-a-time Socratic loop until intent is clear, then hands off to `$plan` or `$ralph`.

---

## Best practices

- **Codex-first** — OMX is a workflow layer, not a replacement for Codex; start with `omx --madmax --high`
- **Use `$plan` before `$ralph`** — plan first when scope is unclear; ralph for guaranteed execution
- **`$ralplan` for consensus** — use when multiple planning perspectives are needed before committing
- **`$deep-interview` gates execution** — always use for vague greenfield or brownfield work
- **Team mode is optional** — use `$team` for coordinated workers, `$ulw` for independent burst work, and `$ultraqa` for QA fan-out
- **Cross-model consultation** — `$ask-claude` and `$ask-gemini` for second opinions on design or architecture
- **`omx explore` for safe lookups** — read-only; won't modify anything
- **`omx doctor` when stuck** — diagnose installation issues before manual debugging

---

## Quick Reference

| Command/Skill | Action |
|--------------|--------|
| `omx --madmax --high` | Recommended launch |
| `/prompts:architect "..."` | Analysis and design review |
| `$autopilot "..."` | Full autonomous idea-to-working-code pipeline |
| `$plan "..."` | Strategic planning |
| `$deep-interview "..."` | Clarify vague requests |
| `$ralph "..."` | Persistent loop until done |
| `$ralplan "..."` | Consensus planning |
| `$team N:role "..."` | Parallel coordinated agents |
| `$ulw "..."` | Maximum parallelism |
| `$ultraqa "..."` | Parallel QA/review burst |
| `omx explore --prompt "..."` | Read-only repo exploration |
| `omx sparkshell <cmd>` | Bounded shell inspection |
| `omx setup` | Install/re-install OMX |
| `omx doctor` | Diagnose issues |
| `omx cancel` / `$cancel` | Cancel active modes |

→ [Website](https://yeachan-heo.github.io/oh-my-codex-website/) · [GitHub](https://github.com/Yeachan-Heo/oh-my-codex) · [npm](https://www.npmjs.com/package/oh-my-codex)

---

## References

| File | Contents |
|------|---------|
| [references/agents-catalog.md](references/agents-catalog.md) | All 30+ agent profiles and use cases |
| [references/skills-reference.md](references/skills-reference.md) | Full skill list with triggers and descriptions |
| [references/cli-reference.md](references/cli-reference.md) | Complete CLI: omx team/explore/sparkshell/reasoning |
| [references/parallel-quality-workflows.md](references/parallel-quality-workflows.md) | Claude team/autopilot/ultrawork/ultraqa parity for Codex/OMX |
