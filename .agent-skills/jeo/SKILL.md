---
name: jeo
description: >
  Integrated AI agent orchestration skill that combines plannotator, ralphmode,
  team or bmad execution, agent-browser verification, and agentation feedback
  loops, while maintaining a project-local `.jeo` ledger for planning,
  development, and QA. Use when the user wants an end-to-end multi-agent
  workflow with plan approval, implementation, UI review, cleanup, and durable
  task history. Triggers on: jeo, annotate, ui-review, multi-agent
  orchestration.
compatibility: "Requires git, node>=18, bash. Optional: bun, docker."
allowed-tools: Read Write Bash Grep Glob Task
metadata:
  tags: jeo, orchestration, ralph, plannotator, agentation, annotate, agentui, UI-review, team, bmad, omc, omx, ohmg, agent-browser, multi-agent, workflow, worktree-cleanup, browser-verification, ui-feedback
  platforms: Claude, Codex, Gemini, OpenCode
  keyword: jeo
  version: 1.6.0
  source: akillness/oh-my-skills
---


# JEO — Integrated Agent Orchestration

> Keyword: `jeo` · `annotate` · `UI-review` · `agentui (deprecated)` | Platforms: Claude Code · Codex CLI · Gemini CLI · OpenCode
>
> Planning (plannotator) → Development (team/bmad) → QA (agent-browser + agentation) → Cleanup (worktree) with a persistent `.jeo` project ledger

## When to use this skill

- Run an end-to-end multi-agent workflow with an explicit planning gate
- Add a browser-backed UI feedback loop with `annotate` or `ui-review`
- Coordinate plan approval, execution, verification, and cleanup in one skill
- Keep long-term rules, short-term system/test plans, active work items, and history in `.jeo/`

## Rules (always enforced)

1. Do not reopen the PLAN gate when the current plan hash already has a terminal result
2. Only a revised plan resets `plan_gate_status` to `pending`
3. Do not process agentation annotations before explicit submit/onSubmit opens the submit gate
4. **NEVER** enter EXECUTE without `plan_approved: true`
5. **NEVER** run plannotator or agentation with `&` (background)
6. **NEVER** reopen an unchanged plan after `approved`, `manual_approved`, `feedback_required`, or `infrastructure_blocked`

Authoritative state: `.omc/state/jeo-state.json`

---

## State Management

All state operations use one script: `scripts/jeo-state-update.py`

```bash
# Initialize (or resume if state exists)
python3 scripts/jeo-state-update.py init "<task>"

# Record checkpoint at each step
python3 scripts/jeo-state-update.py checkpoint <plan|execute|verify|verify_ui|cleanup>

# Record error (auto-increments retry_count; warns at >= 3)
python3 scripts/jeo-state-update.py error "<message>"

# Check resume point
python3 scripts/jeo-state-update.py resume

# Set any field (supports dot notation for nested keys)
python3 scripts/jeo-state-update.py set phase execute
python3 scripts/jeo-state-update.py set agentation.active true
```

---

## .jeo Project Ledger

JEO keeps a human-readable project ledger in `.jeo/` and a machine-readable state file in `.omc/state/jeo-state.json`.

| Path | Purpose |
|------|---------|
| `.jeo/long-term.md` | Durable product intent, standing rules, validation contract |
| `.jeo/short-term.md` | Current system slice, unit-test plan, flow-test plan, exit criteria |
| `.jeo/planned.md` | Planned queue and parking-lot items |
| `.jeo/progress.md` | Current delivery stage and timestamped updates |
| `.jeo/history.md` | Append-only completion summaries |
| `.jeo/tasks/queued/*.md` | Queued work-item files |
| `.jeo/tasks/active/*.md` | Single active work-item file (removed on completion after history is written) |

Use `scripts/jeo-project-sync.py` to keep the ledger in sync:

```bash
python3 scripts/jeo-project-sync.py init "<task>"
python3 scripts/jeo-project-sync.py queue api-contract "Harden API contract validation"
python3 scripts/jeo-project-sync.py start-next
python3 scripts/jeo-project-sync.py stage <planning|development|qa|done>
python3 scripts/jeo-project-sync.py progress "<message>"
python3 scripts/jeo-project-sync.py complete <slug> "<summary>"
python3 scripts/jeo-project-sync.py status
```

### Phase mapping

| JEO phase | Delivery stage | `.jeo` expectation |
|-----------|----------------|--------------------|
| `plan` | `planning` | Review `long-term.md`, refine `short-term.md`, confirm the active work item |
| `execute` | `development` | Update the active task checklist and append implementation notes to `progress.md` |
| `verify` / `verify_ui` | `qa` | Record unit/flow/browser verification evidence in `short-term.md` and `progress.md` |
| `cleanup` / `done` | `done` | Append to `history.md`, check off `planned.md`, remove the task file, queue follow-up work if needed |

Detailed ledger rules: [references/DOT_JEO_LEDGER.md](references/DOT_JEO_LEDGER.md)

---

## Instructions

> Execute steps in order. Each step only proceeds after the previous one completes.

### STEP 0: Bootstrap

```bash
mkdir -p .omc/state .omc/plans .omc/logs
python3 scripts/jeo-state-update.py init "<detected task>"
python3 scripts/jeo-project-sync.py init "<detected task>"
python3 scripts/jeo-project-sync.py start-next
```

Notify the user:
> "JEO activated. Delivery stage: planning. `.jeo` ledger initialized. Add the `annotate` keyword if a UI feedback loop is needed."

---

### STEP 1: PLAN / Planning (never skip)

```bash
python3 scripts/jeo-state-update.py checkpoint plan
python3 scripts/jeo-project-sync.py stage planning
python3 scripts/jeo-project-sync.py progress "Entered planning gate."
```

1. Review `.jeo/long-term.md`, `.jeo/short-term.md`, `.jeo/planned.md`, `.jeo/progress.md`, and `.jeo/history.md` before changing scope.

2. Write `plan.md` (include goal, steps, risks, completion criteria, and the current planning/development/QA expectations from `.jeo/short-term.md`).

3. Update `.jeo/short-term.md` with:
   - the system slice for this run
   - the unit-test plan
   - the flow/browser verification plan

4. **Invoke plannotator** (per platform):

   **Claude Code (hook mode — only supported method):**
   - Call `EnterPlanMode` → write plan content → call `ExitPlanMode`
   - The `ExitPlanMode` PermissionRequest hook fires plannotator automatically
   - Wait for the hook result before proceeding
   - **NEVER** call plannotator via MCP tool or CLI directly in Claude Code

   **Codex / Gemini / OpenCode (blocking CLI):**
   ```bash
   # Skip if same plan hash already has terminal gate status
   # (check plan_gate_status and last_reviewed_plan_hash in jeo-state.json)

   # Resolve JEO scripts directory
   _JEO_SCRIPTS=""
   for _candidate in \
     "${JEO_SKILL_DIR:-}/scripts" \
     "$HOME/.agent-skills/jeo/scripts" \
     "$HOME/.codex/skills/jeo/scripts" \
     "$(pwd)/.agent-skills/jeo/scripts" \
     "scripts"; do
     [ -f "${_candidate}/plannotator-plan-loop.sh" ] && _JEO_SCRIPTS="$_candidate" && break
   done

   # Auto-install plannotator if missing
   bash "${_JEO_SCRIPTS}/ensure-plannotator.sh" || exit 1

   # Run blocking plan gate (no &)
   FEEDBACK_DIR=$(python3 -c "import hashlib,os; h=hashlib.md5(os.getcwd().encode()).hexdigest()[:8]; d=f'/tmp/jeo-{h}'; os.makedirs(d,exist_ok=True); print(d)")
   bash "${_JEO_SCRIPTS}/plannotator-plan-loop.sh" plan.md "${FEEDBACK_DIR}/plannotator_feedback.txt" 3
   ```

5. **Check result:**
   - `approved` (exit 0) → set `phase=execute`, `plan_approved=true` → **STEP 2**
   - Feedback (exit 10) → read feedback, revise `plan.md`, repeat step 2
   - Infrastructure blocked (exit 32) → **Conversation Approval Mode**: output plan.md to user, ask "approve" or provide feedback. **WAIT** for user response
   - Session exited 3 times (exit 30/31) → ask user whether to abort

6. When the plan is approved, append a note to `.jeo/progress.md` describing what is ready to build and what QA must prove.

**NEVER:** enter EXECUTE without `approved: true`. **NEVER:** run with `&` background.

---

### STEP 2: EXECUTE / Development

```bash
python3 scripts/jeo-state-update.py checkpoint execute
python3 scripts/jeo-state-update.py set phase execute
python3 scripts/jeo-project-sync.py stage development
python3 scripts/jeo-project-sync.py progress "Development started from the approved plan."
```

**Auto-detect team availability:**
```bash
TEAM_AVAILABLE=false
if [[ "${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-}" =~ ^(1|true|yes)$ ]]; then
  TEAM_AVAILABLE=true
fi
python3 scripts/jeo-state-update.py set team_available $TEAM_AVAILABLE
```

**Check `next_mode` in state** (set by `claude-plan-gate.py` on approval):

| Condition | Action |
|-----------|--------|
| `next_mode == "ralphmode"` | `/omc:ralphmode "<task>"` |
| Claude Code + omc + team | `/omc:team 3:executor "<task>"` |
| Claude Code without team | **Error** — run `bash scripts/setup-claude.sh`, enable `AGENT_TEAMS=1`, restart |
| Codex / Gemini / OpenCode | BMAD fallback: `/workflow-init` then `/workflow-status` |

While executing, keep the active `.jeo/tasks/active/*.md` file current using:

```bash
# When plan and risks are locked
python3 scripts/jeo-project-sync.py update-checklist planning "Scope captured in plan.md" --done
python3 scripts/jeo-project-sync.py update-checklist planning "Risks and completion criteria written" --done

# As code, docs, and tests are completed
python3 scripts/jeo-project-sync.py update-checklist development "System changes implemented" --done
python3 scripts/jeo-project-sync.py update-checklist development "Unit tests added or updated" --done
```

**NEVER** fall back to single-agent execution in Claude Code.

---

### STEP 3: VERIFY / QA

```bash
python3 scripts/jeo-state-update.py checkpoint verify
python3 scripts/jeo-state-update.py set phase verify
python3 scripts/jeo-project-sync.py stage qa
python3 scripts/jeo-project-sync.py progress "Entered QA verification."
```

1. **Browser verification with agent-browser** (when browser UI is present):
   ```bash
   agent-browser snapshot http://localhost:3000
   ```

2. `annotate` keyword detected → **enter STEP 3.1**
3. Otherwise → **enter STEP 4**

4. Record QA evidence in `.jeo/short-term.md` using:

   ```bash
   python3 scripts/jeo-project-sync.py record-evidence "unit tests: X passing, Y added"
   python3 scripts/jeo-project-sync.py record-evidence "flow check: <description>"
   python3 scripts/jeo-project-sync.py record-evidence "browser verification: <outcome>"
   # Then mark QA checklist items complete
   python3 scripts/jeo-project-sync.py update-checklist qa "Flow or integration checks recorded" --done
   python3 scripts/jeo-project-sync.py update-checklist qa "Browser / annotation verification recorded when applicable" --done
   ```

---

### STEP 3.1: VERIFY_UI (only when `annotate` keyword is detected)

**Pre-flight check (all platforms):**
```bash
if ! curl -sf --connect-timeout 2 http://localhost:4747/health >/dev/null 2>&1; then
  echo "agentation-mcp not running — skipping VERIFY_UI, proceeding to CLEANUP"
  python3 scripts/jeo-state-update.py error "agentation-mcp not running; VERIFY_UI skipped"
  # Proceed to STEP 4 (graceful skip, no exit 1)
fi
```

**If server is running:**

1. Set state: `phase=verify_ui`, `agentation.active=true`, `agentation.submit_gate_status=waiting_for_submit`

2. **Wait for explicit human submit** — do NOT read `/pending` before submit
   - Claude Code: wait for `UserPromptSubmit` hook
   - Others: wait until `ANNOTATE_READY` (or `AGENTUI_READY` alias)

3. After submit → set `agentation.submit_gate_status=submitted`

4. **Process annotations:**
   - **Claude Code (MCP):** `agentation_watch_annotations` (blocking, `batchWindowSeconds:10`, `timeoutSeconds:120`)
   - **Others (HTTP):** poll `GET http://localhost:4747/pending` with timeout

5. **Per-annotation loop:**
   - `acknowledge` → navigate code via `elementPath` (CSS selector) → apply fix → `resolve`
   - Dismissed annotations: skip code changes, increment `annotations.dismissed`

6. `count=0` or timeout → proceed to **STEP 4**

7. If QA discovers follow-up work, add it immediately:
   ```bash
   python3 scripts/jeo-project-sync.py queue follow-up "<new work item>"
   ```

**NEVER:** process draft annotations before submit/onSubmit.

---

### STEP 4: CLEANUP

```bash
python3 scripts/jeo-state-update.py checkpoint cleanup
python3 scripts/jeo-state-update.py set phase cleanup
python3 scripts/jeo-project-sync.py stage done
```

1. Check for uncommitted changes (warn if present)
2. Complete the active `.jeo` task and write the permanent summary:
   ```bash
   python3 scripts/jeo-project-sync.py complete <slug> "<what shipped, what QA proved, what follow-up remains>"
   ```
3. If more work is needed, queue it before leaving cleanup:
   ```bash
   python3 scripts/jeo-project-sync.py queue next-step "<follow-up work>"
   ```
4. Run worktree cleanup:
   ```bash
   bash scripts/worktree-cleanup.sh || git worktree prune
   ```
5. Set `phase=done`

---

## Quick Start

```bash
# Install JEO
npx skills add https://github.com/akillness/oh-my-skills --skill jeo

# Full install (all tools + components)
bash scripts/install.sh --all

# Check status
bash scripts/check-status.sh

# Per-platform setup
bash scripts/setup-claude.sh      # Claude Code hooks
bash scripts/setup-codex.sh       # Codex CLI config
bash scripts/setup-gemini.sh      # Gemini CLI hooks
bash scripts/setup-opencode.sh    # OpenCode plugin
```

---

## Platform Configuration

### Claude Code

Hook config (`~/.claude/settings.json`):
```json
{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "ExitPlanMode",
      "hooks": [{"type": "command", "command": "python3 ~/.claude/skills/jeo/scripts/claude-plan-gate.py", "timeout": 1800}]
    }],
    "UserPromptSubmit": [{
      "matcher": "*",
      "hooks": [{"type": "command", "command": "python3 ~/.claude/skills/jeo/scripts/claude-agentation-submit-hook.py", "timeout": 300}]
    }]
  },
  "mcpServers": {
    "agentation": {"command": "npx", "args": ["-y", "agentation-mcp", "server"]}
  }
}
```

### Codex CLI

Config (`~/.codex/config.toml`):
```toml
notify = ["python3", "~/.codex/hooks/jeo-notify.py"]
[tui]
notifications = ["agent-turn-complete"]
```
> `developer_instructions` must be a top-level string (not a `[table]`), or Codex fails with `invalid type: map, expected a string`.

### Gemini CLI

Instructions in `~/.gemini/GEMINI.md`. AfterAgent hook as safety net in `~/.gemini/settings.json`.
Agent must call plannotator **directly in blocking mode** to receive feedback in the same turn.

### OpenCode

Plugins in `opencode.json`. Slash commands: `/jeo-plan`, `/jeo-exec`, `/jeo-annotate`, `/jeo-cleanup`.

---

## State File Reference

Path: `{worktree}/.omc/state/jeo-state.json`

| Field | Values | Description |
|-------|--------|-------------|
| `phase` | `plan\|execute\|verify\|verify_ui\|cleanup\|done` | Current workflow phase |
| `delivery_stage` | `planning\|development\|qa\|done` | Human-readable stage mirrored into `.jeo/progress.md` |
| `plan_approved` | bool | Whether plan was approved |
| `plan_gate_status` | `pending\|approved\|feedback_required\|infrastructure_blocked\|manual_approved` | Plan gate result |
| `plan_current_hash` | sha256 or null | Current plan.md hash |
| `last_reviewed_plan_hash` | sha256 or null | Hash of last reviewed plan |
| `plan_review_method` | `plannotator\|manual\|null` | How plan was approved |
| `team_available` | bool | Whether team mode is available |
| `retry_count` | int | Error retry count (ask user at >= 3) |
| `last_error` | string or null | Most recent error |
| `checkpoint` | string or null | Last entered phase (for resume) |
| `jeo.root` | path | Project-local planning ledger root |
| `jeo.active_task` | string or null | Active `.jeo` work item slug |
| `jeo.last_sync_at` | ISO 8601 or null | Last `.jeo` sync timestamp |
| `agentation.active` | bool | Whether VERIFY_UI watch loop is running |
| `agentation.submit_gate_status` | `idle\|waiting_for_submit\|submitted` | Submit gate state |
| `agentation.exit_reason` | `all_resolved\|timeout\|user_cancelled\|error\|null` | How watch loop ended |

---

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

## Best practices

1. **Plan first**: always review the plan with ralph+plannotator before executing (catches wrong approaches early)
2. **Team first**: omc team mode is most efficient in Claude Code
3. **bmad fallback**: use BMAD in environments without team (Codex, Gemini)
4. **Keep `.jeo` honest**: long-term is durable, short-term is current, history is append-only
5. **One active task file**: keep only one file under `.jeo/tasks/active/` at a time
6. **Complete means summarize + delete task file**: write history first, then remove the task file
7. **Worktree cleanup**: run `worktree-cleanup.sh` immediately after work completes (prevents branch pollution)
8. **State persistence**: use `.omc/state/jeo-state.json` and `.jeo/` together across sessions
9. **annotate**: use the `annotate` keyword to run the agentation watch loop for complex UI changes (precise code changes via CSS selector). `agentui` is a backward-compatible alias.

---

## Troubleshooting

| Issue | Solution |
|-------|---------|
| plannotator not running | JEO auto-runs `ensure-plannotator.sh`; if it fails: `bash scripts/check-status.sh` |
| plannotator not opening (Claude Code) | It's hook-only. Use `EnterPlanMode` → `ExitPlanMode`. Check: `cat ~/.claude/settings.json` |
| Same plan re-reviewed (Codex) | Compare `last_reviewed_plan_hash` with current plan.md hash — skip if match + terminal status |
| Codex startup failure | Re-run `bash scripts/setup-codex.sh` — `developer_instructions` must be a top-level string |
| team mode not working | Run `bash scripts/setup-claude.sh`, restart Claude Code, verify `AGENT_TEAMS=1` |
| agentation not opening | Check `curl http://localhost:4747/health` and `/sessions` |
| annotation not in code | Include `summary` field when calling `agentation_resolve_annotation` |
| `.jeo` not updating | Run `python3 scripts/jeo-project-sync.py status` and ensure `.jeo/` exists at the git root |
| worktree conflict | `git worktree prune && git worktree list` |

---

## References

- [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) — Claude Code multi-agent
- [plannotator](https://plannotator.ai) — visual plan/diff review
- [BMAD Method](https://github.com/bmad-dev/BMAD-METHOD) — structured AI development workflow
- [Agent Skills Spec](https://agentskills.io/specification) — skill format specification
- [agentation](https://github.com/benjitaylor/agentation) — UI annotation → agent code fix (`annotate`; `agentui` backward compatible)
- [`.jeo` ledger reference](references/DOT_JEO_LEDGER.md) — project-local planning, development, and QA ledger
