# Platform Map: vibe-kanban structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Agent choice on each card | Choose Claude Code per card/workspace when it owns one bounded coding task | Choose Codex per card/workspace when comparison or specialization matters | Choose Gemini per card/workspace when the environment or operator prefers Gemini CLI | `settings.agent_mix` |
| Repo/base branch | Set repo + base branch before starting a workspace | Same | Same | `settings.repo_scope` |
| Review surface | Board-first, PR-first, or board-then-PR | Same | Same | `settings.review_surface` |
| Port/runtime setup | Separate board port from preview/dev server ports | Same | Same | `settings.runtime_ports` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Use only for bounded coding cards | Yes | Yes | Yes | `rules.card_scope` |
| Route planning-only requests away | Route to `task-planning`, `survey`, `plannotator`, or `jeo` before opening a board | Same | Same | `rules.route_planning_first` |
| Route browser/exact UI review away | Route to `agentation`, `agent-browser`, or `playwriter` | Same | Same | `rules.route_browser_review` |
| Route non-code PM / GTM / game-production boards away | Route to PM, marketing, or game workflow skills | Same | Same | `rules.non_code_boundary` |
| Keep cleanup explicit | prune worktrees, stale branches, and leftover servers after close/merge | Same | Same | `rules.cleanup_required` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Before board start | classify board need and card shape | same | same | `hooks.preflight_classify` |
| During execution | inspect logs/diffs and decide retry vs split vs approve | same | same | `hooks.review_loop` |
| Before merge/close | preserve comments and review notes, then choose PR handoff | same | same | `hooks.handoff` |
| After close | prune worktrees/branches and stop stale dev servers | same | same | `hooks.cleanup` |

## Platform Gaps
- `vibe-kanban` is more of a shared operator surface than a vendor-native feature set, so the useful abstraction is board/workspace/review behavior rather than platform-specific flags.
- Claude/Codex/Gemini differences matter less than whether the operator has a clean card contract, isolated workspace, and durable review/cleanup loop.
- The cleanest cross-platform abstraction remains: `settings` for card/repo/review choices, `rules` for route-outs and safety boundaries, and `hooks` for preflight/review/cleanup lifecycle behavior.
