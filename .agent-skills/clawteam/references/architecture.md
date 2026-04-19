# ClawTeam architecture

## Overview
ClawTeam is a filesystem-first swarm runner. It combines:
- **team state** (`team`, `task`, `inbox`, `workspace`, `lifecycle` commands)
- **worker runtime backends** (`tmux` or `subprocess`)
- **workspace isolation** (typically git worktrees)
- **monitoring surfaces** (`board show/live/attach/serve`)
- **provider/runtime profiles** (`preset`, `profile`)

## Core operator surfaces

### Team lifecycle
```bash
clawteam team spawn-team my-team -d "Build the auth module" -n leader
clawteam team discover
clawteam team status my-team
clawteam team cleanup my-team --force
```

### Worker spawning
```bash
# tmux backend
clawteam spawn tmux claude --team my-team --agent-name architect --task "Design the API schema"
clawteam spawn tmux codex  --team my-team --agent-name tester   --task "Write integration tests"

# subprocess backend
clawteam spawn subprocess cursor --team my-team --agent-name reviewer --task "Review the landing page copy"
```

### Task and inbox state
```bash
clawteam task create my-team "Implement auth flow" -o backend
clawteam task update my-team 2 --status in_progress
clawteam task update my-team 2 --status completed
clawteam task list my-team --status blocked

clawteam inbox send my-team backend "Wait for API spec handoff"
clawteam inbox receive my-team
clawteam inbox peek my-team
```

### Monitoring
```bash
clawteam board show my-team
clawteam board live my-team --interval 3
clawteam board attach my-team
clawteam board serve --port 8080
```

## Workspace isolation
Typical runs give each worker its own git worktree / isolated workspace so parallel workers can operate without stomping on each other.

Useful commands:
```bash
clawteam workspace list my-team
clawteam workspace checkpoint my-team backend
clawteam workspace merge my-team backend
clawteam workspace cleanup my-team backend
```

## Runtime settings
Provider/model/runtime settings increasingly flow through presets and profiles rather than ad hoc environment juggling.

```bash
clawteam preset list
clawteam preset show moonshot-cn
clawteam preset generate-profile moonshot-cn claude --name claude-kimi
clawteam profile doctor claude
clawteam profile test claude-kimi
```

## Operational caveats
- Long-running worker persistence is not guaranteed in all backends. Upstream issue #148 documents keepalive problems for ongoing-job subprocess patterns.
- Parsed agent-definition/config files may not fully apply at runtime. Upstream issue #146 documents gaps between parsed definitions and actual spawn behavior.
- ClawTeam is strongest when the user truly wants explicit team/task/inbox/worktree state; generic orchestration requests may belong elsewhere.
