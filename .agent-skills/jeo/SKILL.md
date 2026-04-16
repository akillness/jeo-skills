---
name: jeo
description: "Run the repo's integrated multi-agent delivery loop: plan with ralph and plannotator, execute with the platform runtime (omc, omx, ohmg) or bmad, verify browser behavior with agent-browser, apply submit-gated UI feedback with agentation, and finish with cleanup while maintaining a project-local .jeo ledger and resumable state. Use when the user wants one orchestration surface for planning, implementation, QA, resume/recovery, and durable task history across Claude Code, Codex CLI, Gemini CLI, or OpenCode. Triggers on: jeo, annotate, ui-review, multi-agent orchestration, resume this workflow, continue from .jeo, end-to-end agent loop."
compatibility: "Requires git, node>=18, bash. Optional: bun, docker."
allowed-tools: Read Write Bash Grep Glob Task
metadata:
  tags: jeo, orchestration, ralph, plannotator, agentation, annotate, agentui, UI-review, team, bmad, omc, omx, ohmg, agent-browser, multi-agent, workflow, worktree-cleanup, browser-verification, ui-feedback
  platforms: Claude, Codex, Gemini, OpenCode
  keyword: jeo
  version: 1.6.2
  source: akillness/oh-my-skills
---

# JEO — Integrated Agent Orchestration

> Keyword: `jeo` · `annotate` · `UI-review` · `agentui (deprecated)` | Platforms: Claude Code · Codex CLI · Gemini CLI · OpenCode
>
> Planning (`ralph` + `plannotator`) → Development (`omc` / `omx` / `ohmg` / `bmad`) → QA (`agent-browser` + optional `agentation`) → Cleanup, backed by a persistent `.jeo/` project ledger.

## When to use this skill

- Run an end-to-end multi-agent workflow with an explicit planning gate
- Keep long-term rules, short-term system/test plans, queued work, live progress, and append-only history in `.jeo/`
- Resume a previous project-local delivery loop instead of restarting orchestration from scratch
- Add a browser-backed UI review loop with `annotate` / `ui-review`
- Coordinate plan approval, execution, verification, and cleanup in one skill while preserving neighboring skill boundaries

## When **not** to use this skill

- If the task is mainly **spec-first clarification or persistent completion until verification passes** → use `ralph`
- If the task is mainly **visual plan approval or diff review** → use `plannotator`
- If the task is mainly **browser verification without the full delivery loop** → use `agent-browser`
- If the task is mainly **rendered UI annotation feedback on an existing app** → use `agentation`
- If the task is mainly **platform-native runtime orchestration** → use `omc` (Claude), `omx` (Codex), or `ohmg` (Gemini/Antigravity)
- If the task is mainly **lower-friction trusted automation / approval posture** → use `ralphmode`

## Rules (always enforced)

1. Do not reopen the PLAN gate when the current plan hash already has a terminal result
2. Only a revised plan resets `plan_gate_status` to `pending`
3. Do not process agentation annotations before explicit submit/onSubmit opens the submit gate
4. **NEVER** enter EXECUTE without `plan_approved: true`
5. **NEVER** run plannotator or agentation with `&` (background)
6. **NEVER** reopen an unchanged plan after `approved`, `manual_approved`, `feedback_required`, or `infrastructure_blocked`

Authoritative machine state: `.omc/state/jeo-state.json`

## State + ledger overview

JEO uses two persistence layers together:

| Layer | Path | Purpose |
|------|------|---------|
| Machine state | `.omc/state/jeo-state.json` | Current phase, plan-gate status, retries, submit-gate state, resume checkpoint |
| Human ledger | `.jeo/` | Durable project intent, current scope, queued/active tasks, progress notes, completion history |

Common commands:

```bash
# Initialize or resume state
python3 scripts/jeo-state-update.py init "<task>"
python3 scripts/jeo-state-update.py resume

# Initialize or inspect the project ledger
python3 scripts/jeo-project-sync.py init "<task>"
python3 scripts/jeo-project-sync.py status
python3 scripts/jeo-project-sync.py start-next
```

Ledger details live in [references/DOT_JEO_LEDGER.md](references/DOT_JEO_LEDGER.md).
State fields, troubleshooting, and platform-specific config snippets live in [references/STATE_AND_TROUBLESHOOTING.md](references/STATE_AND_TROUBLESHOOTING.md) and [references/PLATFORM_SETUP.md](references/PLATFORM_SETUP.md).

## Instructions

> Execute the steps in order. Each step only proceeds after the previous one completes.

### STEP 0: Bootstrap / Resume

```bash
mkdir -p .omc/state .omc/plans .omc/logs
python3 scripts/jeo-state-update.py init "<detected task>"
python3 scripts/jeo-project-sync.py init "<detected task>"
python3 scripts/jeo-project-sync.py start-next
```

Then:
1. Read the current `.jeo/long-term.md`, `.jeo/short-term.md`, `.jeo/planned.md`, `.jeo/progress.md`, and `.jeo/history.md` if they already exist.
2. Run the platform setup relevant to the current runtime if it has not been installed yet. See [references/PLATFORM_SETUP.md](references/PLATFORM_SETUP.md).
3. If Claude Code hooks look wrong, run `bash scripts/setup-claude.sh` before continuing.
4. Notify the user that JEO is active and whether `annotate` is part of the run.

### STEP 1: PLAN / Planning (never skip)

```bash
python3 scripts/jeo-state-update.py checkpoint plan
python3 scripts/jeo-project-sync.py stage planning
python3 scripts/jeo-project-sync.py progress "Entered planning gate."
```

1. Review the existing `.jeo` ledger before changing scope.
2. Write `plan.md` with goal, steps, risks, completion criteria, and the current planning/development/QA expectations from `.jeo/short-term.md`.
3. Update `.jeo/short-term.md` with:
   - the system slice for this run
   - the unit-test plan
   - the flow/browser verification plan
4. Invoke **plannotator** per platform:
   - **Claude Code**: `EnterPlanMode` → write plan → `ExitPlanMode`; the hook fires `claude-plan-gate.py`
   - **Codex / Gemini / OpenCode**: run `bash scripts/plannotator-plan-loop.sh plan.md <feedback-file> 3` in blocking mode after `ensure-plannotator.sh`
5. Check the result:
   - `approved` → proceed to EXECUTE
   - feedback → revise `plan.md`, loop back
   - `infrastructure_blocked` → surface the plan for manual approval and wait
   - repeated exits / retry ceiling → ask whether to abort
6. Append a progress note describing what is ready to build and what QA must prove.

### STEP 2: EXECUTE / Development

```bash
python3 scripts/jeo-state-update.py checkpoint execute
python3 scripts/jeo-state-update.py set phase execute
python3 scripts/jeo-project-sync.py stage development
python3 scripts/jeo-project-sync.py progress "Development started from the approved plan."
```

1. Detect the runtime path:
   - `next_mode == "ralphmode"` → use `ralphmode`
   - Claude Code + `omc` team available → `/omc:team 3:executor "<task>"`
   - Codex / Gemini / OpenCode → BMAD fallback (`/workflow-init` then `/workflow-status`)
2. Keep the active `.jeo/tasks/active/*.md` file current while work progresses.
3. Mark planning and development checklist items as they complete:

```bash
python3 scripts/jeo-project-sync.py update-checklist planning "Scope captured in plan.md" --done
python3 scripts/jeo-project-sync.py update-checklist development "System changes implemented" --done
python3 scripts/jeo-project-sync.py update-checklist development "Unit tests added or updated" --done
```

4. **NEVER** fall back to single-agent execution in Claude Code when team mode is the required path.

### STEP 3: VERIFY / QA

```bash
python3 scripts/jeo-state-update.py checkpoint verify
python3 scripts/jeo-state-update.py set phase verify
python3 scripts/jeo-project-sync.py stage qa
python3 scripts/jeo-project-sync.py progress "Entered QA verification."
```

1. For browser-visible work, verify behavior with `agent-browser`.
2. Record QA evidence in `.jeo/short-term.md` and the active task file.
3. Mark QA checklist items complete.
4. If `annotate` / `ui-review` is part of the run, continue to **STEP 3.1**.
5. Otherwise, continue to **STEP 4**.

Useful commands:

```bash
agent-browser snapshot http://localhost:3000
python3 scripts/jeo-project-sync.py record-evidence "unit tests: X passing, Y added"
python3 scripts/jeo-project-sync.py record-evidence "flow check: <description>"
python3 scripts/jeo-project-sync.py record-evidence "browser verification: <outcome>"
python3 scripts/jeo-project-sync.py update-checklist qa "Flow or integration checks recorded" --done
python3 scripts/jeo-project-sync.py update-checklist qa "Browser / annotation verification recorded when applicable" --done
```

### STEP 3.1: VERIFY_UI (only when `annotate` / `ui-review` is detected)

1. Run the preflight check. If `agentation-mcp` is unavailable, record the skip and continue to cleanup.
2. Set `phase=verify_ui`, `agentation.active=true`, and `agentation.submit_gate_status=waiting_for_submit`.
3. Wait for explicit human submit:
   - Claude Code: `UserPromptSubmit` hook
   - Others: explicit ready/submit handoff (`ANNOTATE_READY` or `AGENTUI_READY` alias)
4. After submit, process annotations in blocking mode:
   - Claude Code: `agentation_watch_annotations`
   - Others: HTTP polling fallback
5. Per annotation: acknowledge → navigate using `elementPath` → apply fix → resolve.
6. If QA discovers follow-up work, queue it immediately.
7. When the queue is empty or the timeout hits, continue to cleanup.

### STEP 4: CLEANUP

```bash
python3 scripts/jeo-state-update.py checkpoint cleanup
python3 scripts/jeo-state-update.py set phase cleanup
python3 scripts/jeo-project-sync.py stage done
```

1. Check for uncommitted changes and warn if present.
2. Complete the active `.jeo` task and write the permanent summary:

```bash
python3 scripts/jeo-project-sync.py complete <slug> "<what shipped, what QA proved, what follow-up remains>"
```

3. Queue follow-up work before leaving cleanup if more work remains:

```bash
python3 scripts/jeo-project-sync.py queue next-step "<follow-up work>"
```

4. Run worktree cleanup:

```bash
bash scripts/worktree-cleanup.sh || git worktree prune
```

5. Set `phase=done`.

## Quick Start

```bash
# Install JEO
npx skills add https://github.com/akillness/oh-my-skills --skill jeo

# Full install (all tools + components)
bash scripts/install.sh --all

# Check status
bash scripts/check-status.sh

# Per-platform setup
bash scripts/setup-claude.sh
bash scripts/setup-codex.sh
bash scripts/setup-gemini.sh
bash scripts/setup-opencode.sh
```

For config snippets and runtime-specific notes, see [references/PLATFORM_SETUP.md](references/PLATFORM_SETUP.md).

## Supporting references

- [references/FLOW.md](references/FLOW.md) — detailed phase flow, submit-gate behavior, and platform execution paths
- [references/DOT_JEO_LEDGER.md](references/DOT_JEO_LEDGER.md) — `.jeo/` ledger structure and operating rules
- [references/PLATFORM_SETUP.md](references/PLATFORM_SETUP.md) — Claude/Codex/Gemini/OpenCode config surfaces and install notes
- [references/STATE_AND_TROUBLESHOOTING.md](references/STATE_AND_TROUBLESHOOTING.md) — state-field reference and common failure recovery

## Examples

### Example 1: New feature with `.jeo` ledger

```bash
python3 scripts/jeo-project-sync.py init "Build exportable analytics dashboard"
python3 scripts/jeo-project-sync.py start-next
python3 scripts/jeo-project-sync.py stage planning
```

Then run the normal JEO flow: plan approval → development → QA → cleanup. When done:

```bash
python3 scripts/jeo-project-sync.py complete 000-primary "Dashboard shipped with unit tests, flow checks, and browser verification."
```

### Example 2: Add follow-up work discovered during QA

```bash
python3 scripts/jeo-project-sync.py queue qa-follow-up "Fix chart legend overlap on small screens"
python3 scripts/jeo-project-sync.py progress "Queued QA follow-up from annotate review."
```

### Example 3: Resume an existing workflow without rebuilding the ledger

```bash
python3 scripts/jeo-state-update.py resume
python3 scripts/jeo-project-sync.py status
python3 scripts/jeo-project-sync.py start-next
```

Use the saved phase, active task, and `.jeo/history.md` context to continue the loop instead of recreating plan and task structure from scratch.

## Best practices

1. **Plan first**: always review the plan with `ralph` + `plannotator` before executing.
2. **Keep JEO as the router**: let `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, and `ralphmode` own their specialist surfaces.
3. **Keep `.jeo` honest**: long-term is durable, short-term is current, history is append-only.
4. **One active task file**: keep only one file under `.jeo/tasks/active/` at a time.
5. **Complete means summarize + delete task file**: write history first, then remove the task file.
6. **Worktree cleanup matters**: run `worktree-cleanup.sh` immediately after work completes.
7. **Respect submit gating**: do not process annotations before explicit submit/onSubmit.
8. **Use the reference docs** for config, state fields, and troubleshooting instead of re-expanding the main skill file.

## References

- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — Claude Code multi-agent runtime
- [plannotator](https://plannotator.ai) — visual plan/diff review
- [BMAD Method](https://github.com/bmad-dev/BMAD-METHOD) — structured AI development workflow
- [Agent Skills Spec](https://agentskills.io/specification) — skill format specification
- [agentation](https://github.com/benjitaylor/agentation) — UI annotation → agent code fix
- [`.jeo` ledger reference](references/DOT_JEO_LEDGER.md) — project-local planning, development, and QA ledger
