# Solution Landscape: clawteam structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current `clawteam` skill | Local skill wrapper around ClawTeam CLI | Already visible in README/setup/manifests; has support docs and evals | Front door is oversized; command examples lag upstream; route-outs are weak | Best candidate for bounded improvement |
| Upstream ClawTeam README / PyPI docs | Canonical product documentation | Accurate source of current commands, profiles/presets, board modes, launch flow | Too broad for local skill activation; not tuned for repo boundary decisions | Should inform, not replace, the skill |
| Neighbor orchestration skills (`jeo`, `omc`, `omx`, `ohmg`, `vibe-kanban`) | Adjacent orchestration / runtime / board-control surfaces | Strong route-out targets for planning/runtime/board responsibilities | Not replacements for ClawTeam's git-worktree + inbox/task swarm workflow | Key to boundary cleanup |
| Generic delegation tools (`delegate_task`, Codex/Claude/Cursor parallel features) | Simpler parallel task spawning | Good for light subtask fan-out | Do not provide ClawTeam's explicit team state, inbox/task primitives, tmux/web monitoring, or profile/template system | Important contradiction with broad "agent swarm" wording |

## Categories
- **Canonical operator surface**: upstream ClawTeam CLI + local `clawteam` skill
- **Adjacent orchestration routers**: `jeo`, `omc`, `omx`, `ohmg`
- **Board/work tracking neighbors**: `vibe-kanban`
- **Lightweight subtask delegation alternatives**: built-in agent delegation / subagents

## What People Actually Use
Upstream docs show two real operator modes: manual team lifecycle (`team spawn-team` + `spawn` + task/inbox/board commands) and one-command template launches (`launch <template>`). They also increasingly rely on runtime profiles/presets for non-default providers and distinguish tmux vs subprocess spawn backends. This means the local skill is most useful when it first routes the user into the right operating mode instead of front-loading a monolithic command catalog.

## Frequency Ranking
1. **Manual team control** — `team spawn-team`, `spawn`, `task create/update`, `inbox send`, `board attach/serve`
2. **Launch/template workflows** — `launch hedge-fund`, custom templates, template listing
3. **Monitoring / board flows** — `board show/live/attach/serve`
4. **Provider/runtime setup** — `profile doctor/test`, `preset generate-profile`
5. **Long-running / edge-case reality** — worker keepalive issues, agent-definition gaps, subprocess vs tmux caveats

## Key Gaps
- The skill does not clearly route among manual control, template launch, monitoring, or provider-profile setup modes.
- Several examples/support docs still reflect earlier commands (`send`, `broadcast`, `task add/done/block`, `monitor`) more than the current upstream command surfaces.
- The skill does not explicitly warn about long-running worker caveats or configuration/definition limitations documented upstream.
- Discovery surfaces describe the skill as a generic swarm wrapper instead of a ClawTeam-specific operator front door.

## Contradictions
- **Marketed promise:** one command, autonomous swarm, full automation.  
  **User reality:** operators still need to choose the right backend (`tmux` vs `subprocess`), the right control surface (`launch` vs manual team lifecycle), and sometimes work around worker/process edge cases or config limitations.
- **Current skill framing:** generic multi-agent orchestration.  
  **Structural reality:** the value is narrower and stronger — a ClawTeam-specific operator workflow with git worktrees, task/inbox state, profiles/presets, and board/runtime management.

## Key Insight
The best bounded move is not another multi-agent wrapper. It is to shrink `clawteam` into a routing-first operator skill that starts with one question — manual team control, template launch, monitoring/inspection, or provider/runtime setup? — then pushes the slower-changing command detail into focused references while syncing discovery surfaces to the upstream CLI reality.

Curated sources:
- GitHub raw primary-source retrieval: https://raw.githubusercontent.com/HKUDS/ClawTeam/main/README.md
- PyPI primary-source retrieval: https://pypi.org/project/clawteam/
- GitHub API primary-source retrieval: https://api.github.com/repos/HKUDS/ClawTeam
- Local repo evidence: `.agent-skills/clawteam/SKILL.md`, `references/*.md`, `evals/evals.json`, `graphify-out/GRAPH_REPORT.md`
