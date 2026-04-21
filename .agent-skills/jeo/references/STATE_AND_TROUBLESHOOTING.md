# JEO State and Troubleshooting Reference

## State file reference

Path: `{worktree}/.omc/state/jeo-state.json`

| Field | Values | Description |
|-------|--------|-------------|
| `phase` | `plan\|execute\|verify\|verify_ui\|cleanup\|done` | Current workflow phase |
| `delivery_stage` | `planning\|development\|qa\|done` | Human-readable stage mirrored into `.jeo/progress.md` |
| `plan_approved` | bool | Whether the plan was approved |
| `plan_gate_status` | `pending\|approved\|feedback_required\|infrastructure_blocked\|manual_approved` | Plan gate result |
| `plan_current_hash` | sha256 or null | Current `plan.md` hash |
| `last_reviewed_plan_hash` | sha256 or null | Hash of the last reviewed plan |
| `plan_review_method` | `plannotator\|manual\|null` | How the plan was approved |
| `team_available` | bool | Whether the preferred runtime team path is available |
| `retry_count` | int | Error retry count |
| `last_error` | string or null | Most recent error |
| `checkpoint` | string or null | Last entered phase for resume |
| `jeo.root` | path | Project-local planning ledger root |
| `jeo.active_task` | string or null | Active `.jeo` work item slug |
| `jeo.last_sync_at` | ISO 8601 or null | Last `.jeo` sync timestamp |
| `agentation.active` | bool | Whether VERIFY_UI watch loop is running |
| `agentation.submit_gate_status` | `idle\|waiting_for_submit\|submitted` | Submit gate state |
| `agentation.exit_reason` | `all_resolved\|timeout\|user_cancelled\|error\|null` | How the watch loop ended |

## Resume checks

```bash
python3 scripts/jeo-state-update.py resume
python3 scripts/jeo-project-sync.py status
```

Use the saved phase plus the active `.jeo` task to decide whether to continue planning, execution, QA, or cleanup.

## Troubleshooting

| Issue | Solution |
|-------|---------|
| plannotator not running | JEO auto-runs `ensure-plannotator.sh`; if it fails, run `bash scripts/check-status.sh` |
| plannotator not opening (Claude Code) | It is hook-only. Use `EnterPlanMode` → `ExitPlanMode`, then inspect `~/.claude/settings.json` |
| Same plan re-reviewed (Codex/Gemini/OpenCode) | Compare `last_reviewed_plan_hash` with the current `plan.md` hash and skip if it already has a terminal gate status |
| Codex startup failure | Re-run `bash scripts/setup-codex.sh`; `developer_instructions` must be a top-level string |
| team mode not working | Run `bash scripts/setup-claude.sh`, restart Claude Code, verify the required team setting/environment |
| agentation not opening | Check `curl http://localhost:4747/health` and `/sessions` |
| annotation not in code | Include a useful summary when resolving the annotation so the mapping stays intelligible |
| `.jeo` not updating | Run `python3 scripts/jeo-project-sync.py status` and confirm `.jeo/` exists at the git root |
| worktree conflict | `git worktree prune && git worktree list` |

## Practical recovery rule

If the failure is runtime-specific, repair that runtime using [PLATFORM_SETUP.md](PLATFORM_SETUP.md). If the failure is orchestration-state-specific, inspect this file and `.jeo/` before restarting the whole workflow.
