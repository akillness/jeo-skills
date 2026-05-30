# Parallel and Quality Workflows

This reference maps Claude Code OMC workflows (`team`, `ultrawork`, `ultraqa`) to Codex-first OMX usage.

## Decision Table

| Need | Use | Command shape | State |
|------|-----|---------------|-------|
| Coordinated multi-agent implementation | `team` | `$team 3:executor "task"` inside Codex or `omx team 3:executor "task"` in the shell | `.omx/state/`, tmux/worktree sessions |
| Many independent implementation lanes | `ultrawork` | `$ulw "task"` or `$ultrawork "task"` | `.omx/state/ultrawork*` when runtime persists it |
| Parallel QA/review pass | `ultraqa` | `$ultraqa "target"` | `.omx/state/`, review artifacts as configured |

## Environment Checks

Run:

```bash
omx doctor
omx doctor --team
```

Team mode needs `tmux` on macOS/Linux/WSL2 or `psmux` on native Windows. Use `$ulw` instead of `$team` when the work is independent and does not need a shared task board.

## Claude Parity Notes

- OMC `/team` is not the same runtime as OMX `$team`, but the operator intent is similar: coordinated workers.
- OMC `/ultrawork` maps most directly to OMX `$ulw`.
- OMC `/ultraqa` maps most directly to OMX `$ultraqa`.
- Keep Codex runtime files under `.omx/`; do not reuse `.omc/state/` from a Claude session.
