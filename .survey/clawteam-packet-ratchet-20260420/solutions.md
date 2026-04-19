# Solution Landscape: clawteam packet ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| ClawTeam | Operator-facing swarm runtime with team/task/inbox/worktree/board/profile surfaces | Explicit runtime control, template launch, mixed-agent teams, visible tmux/worktree model | Worker persistence gaps, config-application drift, trust/governance rough edges | Best fit when the user explicitly wants ClawTeam itself |
| OpenHands | Coding-agent shell / app surface | Strong coding-agent framing, UI-centric workflow | Can drift into loop/state/UI issues rather than explicit swarm control | Not a team/task/inbox runtime |
| CrewAI | Python orchestration framework (`Crews` / `Flows`) | Flexible programmable orchestration | Reliability, observability, and dependency friction | Better as a framework lane than an operator-runtime lane |
| AutoGen | Multi-agent framework API | Familiar framework vocabulary, broad history | Maintenance-mode boundary, observability and memory complexity | Too abstract to replace ClawTeam’s operator surface |
| OpenAI Swarm | Stateless handoff library | Small, educational handoff model | Explicitly thin / non-production / persistence-light | Useful contrast: wrapper, not runtime |
| claude-swarm / wt / Legio / Goblin Forge | tmux + worktree coordination variants | Show what real operators actually do: sessions, panes, worktrees, monitors | Heavy manual control, rough edges, polling/watchdog patterns | Strong evidence that packet-first operator reality matters |

## Categories
- **Team/task/inbox/worktree runtimes:** ClawTeam
- **Coding-agent shells / app surfaces:** OpenHands
- **Generic orchestration frameworks:** CrewAI, AutoGen, OpenAI Swarm
- **tmux/worktree operator kits:** claude-swarm, wt, Legio, Goblin Forge

## What People Actually Use
Real usage still clusters around tmux + git worktrees + manual attach/inspect/recover behavior. Even more “platformized” alternatives still expose operator verbs for sessions, panes, status polling, or manual cleanup. That supports a smaller packet-first `clawteam` front door that admits terminal/process reality instead of pretending the runtime is a frictionless autonomous layer.

## Frequency Ranking
1. **Reliability / persistence / loop failures** — workers stop after one turn, event delivery is thin, or automation loops drift.
2. **Observability / state visibility gaps** — operators still need boards, logs, polling, or manual pane inspection.
3. **Setup / runtime friction** — tmux, paths, trust prompts, profiles, dependencies, and backend differences still matter.
4. **Security / governance / trust boundaries** — inbox spoofing, isolation, unsandboxed execution, and self-report trust remain active concerns.
5. **Wrapper ambiguity** — many frameworks market “multi-agent” broadly, but do not own the concrete operator/runtime surface that `clawteam` owns.

## Key Gaps
- Long-running worker behavior remains fragile enough that users script loop instructions or watchdogs themselves.
- Task-governance and PM-adjacent workflow features still spill outside the runtime.
- The market has many orchestration abstractions, but fewer tools that are honest about the operator-facing tmux/worktree runtime reality.

## Contradictions
- Marketed autonomy vs operator reality: tools promise coordinated multi-agent work, but users still manually attach to sessions, inspect panes, prune worktrees, and inject loop instructions.
- Configuration richness vs runtime truth: docs imply agent/profile abstraction, while issue traffic shows gaps between parsed config and actual applied behavior.

## Key Insight
The strongest evidence does **not** say the repo needs another swarm/orchestration wrapper. It says `clawteam` should become an even clearer packet-first operator skill for one explicit runtime: choose manual-team, template-launch, monitor/recover, or profile-setup; state the backend reality and caveats up front; then route broad orchestration, board governance, or lightweight delegation outward immediately.

## Sources
- ClawTeam README and issues #52, #70, #76, #83, #95, #98, #99, #107, #108, #130, #146, #148: <https://github.com/HKUDS/ClawTeam>
- OpenHands README and issues #13862, #13942, #13975: <https://github.com/OpenHands/OpenHands>
- CrewAI README and issues #4347, #4682, #4703, #5327: <https://github.com/crewAIInc/crewAI>
- AutoGen README and issues #4564, #5620, #7462: <https://github.com/microsoft/autogen>
- OpenAI Swarm README and issue #70: <https://github.com/openai/swarm>
- claude-swarm: <https://github.com/sethshoultes/claude-swarm>
- wt: <https://github.com/NazmievBulat/wt>
- Legio: <https://github.com/katyella/legio>
- Goblin Forge: <https://github.com/astoreyai/goblin-forge>
