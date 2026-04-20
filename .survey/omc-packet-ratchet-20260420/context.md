# Context: omc packet ratchet

## Workflow Context
OMC sits on top of Claude Code's already multi-surface host runtime. The recurring operator problem is not just "which command?" but "which surface am I actually on?" Upstream OMC docs and issue history show a durable split between the Claude Code in-session/plugin surface (`/team`, `/autopilot`, `/ralph`, hooks, HUD) and the shell CLI surface (`omc setup`, `omc update`, `omc ask`, `omc team`). Setup/update guidance drifts because operators mix marketplace/plugin installs, npm CLI installs, and local-checkout `--plugin-dir` usage.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Claude Code operator | Use slash skills, teams, hooks, and setup flows correctly inside Claude Code | Intermediate |
| Shell-side runtime operator | Run `omc` CLI, tmux workers, updates, and provider consultation from the terminal | Intermediate |
| Local-checkout / plugin-dir maintainer | Develop or test OMC from a local checkout without stale cached plugin state | Advanced |
| Worktree-heavy agent operator | Run OMC across worktrees, tmux sessions, or nested worktree managers | Advanced |
| Cross-runtime orchestrator | Decide when the request should route to `jeo`, `ralphmode`, `omx`, `ohmg`, browser-review, or another owner | Intermediate |

## Current Workarounds
1. Teach the two-surface split explicitly: plugin/in-session commands for Claude Code, `omc` CLI for shell runtime.
2. Use `omc setup --plugin-dir-mode` plus `OMC_PLUGIN_ROOT` when local checkout / plugin-dir is involved.
3. Re-run `/plugin marketplace update omc` plus `/setup`, or use `omc update` / `omc setup`, after upgrades.
4. Use `/omc-doctor`, HUD rebuild steps, or manual cleanup when updates leave duplicate skills or stale state.
5. Fall back to manual tmux layout, multiple `omc team` invocations, or adjacent route-outs when mixed-runtime asks exceed OMC's truthful scope.

## Adjacent Problems
- Duplicate or overlapping install paths create duplicate commands and stale setup state.
- Worktree / `OMC_STATE_DIR` layout problems are easy to misread as generic team-mode failures.
- HUD or rate-limit issues erode trust in whether the current runtime surface is installed and active.
- Long-loop autonomy, permissions posture, browser review, and non-Claude runtimes are adjacent jobs that should route outward rather than expand OMC.

## User Voices
- "README presents plugin and npm as equivalent install methods, but they're not: npm gives the CLI without skills, plugin gives skills without the CLI." — https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2193
- "Every OMC command appears twice." — https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252
- "Users must run the skill separately to get a complete setup — but the skill takes 30-60s..." — https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2551
- "Anyone using `OMC_STATE_DIR` with git worktrees..." — https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2354

## Sources
- https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/README.md
- https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/GETTING-STARTED.md
- https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/REFERENCE.md
- https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2193
- https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252
- https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2354
- https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2551
