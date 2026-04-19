# Context: omc structural hardening

## Workflow Context
`omc` sits at a volatile boundary: Claude Code plugin skills (`/team`, `/autopilot`, `/ralph`, `/ultrawork`) coexist with shell-side `omc` CLI flows (`omc setup`, `omc update`, `omc team`, `omc ask`). Upstream docs now explicitly describe these as two different surfaces that most users install together, while at least one upstream reference page still claims plugin-only support. The current local `omc` skill mirrors too much of that moving operational detail inline, even though this repo already uses smaller routing-first front doors for adjacent orchestration skills.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Claude Code operator | Pick the right OMC surface and invocation for a real task | Intermediate |
| Repo maintainer | Keep `omc` aligned with upstream commands/docs without duplicating volatile manuals | Advanced |
| Worktree / tmux power user | Run team workers, resume sessions, and keep state isolated across branches | Advanced |
| CI / container operator | Keep HUD, setup, and rate-limit behavior stable in ephemeral environments | Advanced |
| Cross-skill orchestrator | Route work cleanly between `omc`, `jeo`, `ralph`, browser-review, and runtime-boundary skills | Intermediate |

## Current Workarounds
1. Re-run setup after updates (`/oh-my-claudecode:omc-setup` or `omc setup`) because hooks, generated files, and registration drift over time. Limitation: this is easy to forget and sometimes recreates duplicate or stale files.
2. Manually edit `~/.claude/settings.json` to enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Limitation: this breaks the “zero config” story and turns team-mode success into an environment preflight issue.
3. Fall back to explicit command surfaces (`/team` vs `omc team`) instead of trusting generic “magic keyword” language. Limitation: users still need to know which runtime they are in.
4. Use plugin-dir flags, `OMC_PLUGIN_ROOT`, and cleanup/doctor flows when local-checkout or duplicate-install behavior gets messy. Limitation: this is operator folklore unless the docs surface it directly.
5. Manually clean stale `.omc/state/` or generated `CLAUDE.md` / agent files when resume or setup behavior goes wrong. Limitation: persistence becomes a maintenance burden rather than an invisible benefit.

## Adjacent Problems
- Upstream docs still disagree about plugin-only vs plugin+CLI support, so local copied instructions stale quickly.
- Legacy aliases and migration churn make giant mode/keyword tables fragile.
- Worktree/state correctness has become a recurring operational problem, not a niche edge case.
- HUD/progress visibility gaps reduce trust in persistent automation claims.
- This repo already has neighboring specialists (`jeo`, `ralph`, `plannotator`, `agent-browser`, `agentation`, `playwriter`, `ralphmode`) that should absorb adjacent responsibilities instead of letting `omc` grow wider.

## User Voices
- “The README conflates two different invocation methods... A reader can't tell... which features are CLI commands, in-session skills, or both.” — [Yeachan-Heo/oh-my-claudecode#2198](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2198)
- “In ephemeral environments (Docker containers, CI, fresh sandboxes) ... the HUD's usage cache starts cold... [requests] get 429'd, enter exponential backoff, and never recover.” — [Yeachan-Heo/oh-my-claudecode#2695](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2695)
- “Users who combine `OMC_STATE_DIR` with `git worktree add` ... find that each worktree gets its own isolated state directory, defeating centralized storage.” — [Yeachan-Heo/oh-my-claudecode#2354](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2354)
- “Running `/team` with the same team name from two sibling git worktrees... collides on every team-scoped namespace.” — [Yeachan-Heo/oh-my-claudecode#2730](https://github.com/Yeachan-Heo/oh-my-claudecode/pull/2730)
- Manual `CLAUDE.md` repair and repeated doctor/setup flows still appear in normal usage — [#1572](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1572), [#2252](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/2252), [#1502](https://github.com/Yeachan-Heo/oh-my-claudecode/issues/1502)
