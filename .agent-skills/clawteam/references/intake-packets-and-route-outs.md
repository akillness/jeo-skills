# ClawTeam intake packets and route-outs

## Start from one packet

| Packet | Use when | Core commands / output | Route away when |
|--------|----------|------------------------|-----------------|
| `manual-team` | The user wants explicit team creation, worker roles, tasks, inboxes, and dependency control | `team spawn-team`, `spawn`, `task create/update/list`, `inbox send/peek/receive`, `board attach` | the user really wants generic orchestration or planning |
| `template-launch` | A built-in team/template already fits the request | `template list`, `launch <template> --team ... --goal ...`, `board attach/serve` | the template is a weak fit and manual roles are the real need |
| `monitor-recover` | A team already exists and the question is visibility, stuck workers, blocked tasks, or workspace drift | `team discover/status`, `board show/live/attach/serve`, `task list`, `inbox peek`, `workspace list` | the job is broader platform debugging or cross-tool comparison |
| `profile-setup` | Provider/model/profile/runtime setup is the blocker | `preset list/show`, `preset generate-profile`, `profile wizard/doctor/test` | the user is asking about generic model routing rather than ClawTeam |
| `route-out` | The request is not really about ClawTeam’s runtime | short explanation + owner handoff | ClawTeam-specific commands are genuinely required |

## Fast route-outs
- **Generic multi-agent planning + implementation + QA** → `jeo`, `omc`, `omx`, `ohmg`
- **Board/work queue governance outside ClawTeam runtime control** → `vibe-kanban`
- **Planning / decomposition** → `task-planning`
- **Tool comparison or landscape research** → `survey`
- **Lightweight parallel fan-out without team/task/inbox/worktree state** → built-in delegation / subagents

## Backend reality

| Backend | Use when | Reality note |
|---------|----------|--------------|
| `tmux` | You want visible workers and operator control | Usually the most truthful default for ClawTeam-style work |
| `subprocess` | You need headless or non-interactive execution | Keep caveats explicit; long-running worker behavior may be fragile |

## Reality checks to say out loud
- ClawTeam workflows still often involve tmux/worktree inspection and manual operator oversight.
- Worker persistence is not guaranteed in every backend or prompt shape.
- Provider/profile/config abstractions should be verified, not assumed.
- Cleanup, merge, and workspace hygiene may still be manual after the run.
