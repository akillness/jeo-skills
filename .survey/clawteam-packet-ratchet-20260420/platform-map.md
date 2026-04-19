# Platform Map: clawteam packet ratchet

## Settings
| Concern | ClawTeam | Broader wrappers in `oh-my-skills` | Common Layer |
|---------|----------|------------------------------------|--------------|
| Runtime/backend choice | Explicit tmux vs subprocess backend selection | Usually abstracted behind orchestration guidance | `settings`: execution backend and environment choice |
| Provider/model configuration | `preset` and `profile` flows tied to spawn behavior | `omc` / `omx` / `ohmg` cover platform-specific runtime selection; `jeo` routes to the right owner | `settings`: provider/model/runtime parameters |
| Workspace isolation | Team/worktree model is first-class | Broader wrappers may delegate isolation to subagents or boards rather than own it directly | `settings`: isolation/workspace model |
| Monitoring surface | `board show/live/attach/serve` is runtime-native | `vibe-kanban` owns broader board governance, not ClawTeam runtime control | `settings`: visibility surface / dashboard choice |

## Rules
| Concern | ClawTeam / local owner | Broader wrapper owner | Common Layer |
|---------|-------------------------|-----------------------|--------------|
| When to use the tool | Only when the user explicitly wants ClawTeam’s team/task/inbox/worktree runtime | `jeo`, `omc`, `omx`, `ohmg` own generic orchestration requests | `rules`: activation boundary |
| Generic multi-agent request | Route out immediately | Owned by the broader orchestration/router skills | `rules`: scope control |
| Board-only governance | Route to `vibe-kanban` when the job is queue/board control rather than ClawTeam runtime ops | `vibe-kanban` | `rules`: board/work-queue ownership |
| Long-running worker expectations | Keep caveats explicit; do not promise persistent subprocess workers | Broader wrappers can offer alternate execution paths but should not hide runtime reality | `rules`: truthfulness / risk disclosure |
| Security / trust concerns | Treat inbox/worktree delegation as an operator-risk surface, not a solved abstraction | Broader wrappers may add policy layers but cannot erase the runtime risk | `rules`: trust / approval / isolation constraints |

## Hooks
| Lifecycle | ClawTeam | Broader wrappers in `oh-my-skills` | Common Layer |
|-----------|----------|------------------------------------|--------------|
| Before spawn | Verify CLI, backend, and provider/profile prerequisites | Broader wrappers choose whether ClawTeam should be used at all | `hooks`: preflight / prerequisite checks |
| During execution | Use board/task/inbox/workspace inspection | Broader wrappers may monitor higher-level task progress | `hooks`: runtime observation |
| Failure/recovery | Check board, team status, inbox, workspaces, worker persistence caveats, trust prompts | Route broader diagnosis to `survey`, runtime-specific skills, or platform owners | `hooks`: recovery / escalation |
| After task completion | Manual cleanup / merge / workspace hygiene still matters | Broader wrappers may own repo-level merge or review flow | `hooks`: teardown / handoff |

## Platform Gaps
- ClawTeam’s strongest differentiator is not model/vendor parity; it is the operator-facing runtime contract around teams, tasks, inboxes, worktrees, and board surfaces.
- Many broader orchestration tools talk in agent/flow abstractions, but fewer expose the concrete tmux/worktree/operator reality this clearly.
- The hardest alignment gap is long-running worker persistence: the runtime abstraction wants durable workers, while current issue evidence still forces manual loop prompts, trust handling, or watchdog scripts.
- That gap argues for a packet-first `clawteam` skill that exposes backend reality and route-outs sooner, not a broader wrapper that hides it.
