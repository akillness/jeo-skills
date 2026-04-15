# Platform Map: vibe-kanban modernization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Agent authentication | `ANTHROPIC_API_KEY` for Claude Code workflows | `OPENAI_API_KEY` for Codex workflows | `GOOGLE_API_KEY` for Gemini workflows | Provider credential must be present before the board can launch useful work |
| MCP server registration | `mcpServers` config entry pointing at `npx vibe-kanban --mcp` | Codex config / script-based MCP registration | MCP/bridge registration for Gemini-capable environment | Register Vibe Kanban as a board-control MCP surface rather than a general coding skill |
| Host / port | Local host/port pair for board + MCP bridge | Same | Same | Keep board host/port explicit and separate from app preview ports |
| Repo / branch target | Select repo + base branch before creating workspace | Same | Same | One workspace should map to one task against one repo/branch target |
| Review mode | Inline review + diff focus | PR/review focus | Review/approval focus | Human review state must be explicit before merge/cleanup |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Unit of work | One workspace/card per bounded task | One workspace/card per bounded task | One workspace/card per bounded task | Do not use the board for giant epics without decomposition |
| Isolation | Worktree + branch isolation per workspace | Same | Same | Preserve git isolation and avoid mixing multiple tasks in one workspace |
| Approval policy | Human reviews diffs/comments before merge | Human reviews PR/comments before merge | Human reviews changes before merge/export | Agent work is proposal-first, not auto-trust |
| Route-outs | Planning-only requests go to planning/orchestration skills | PM/task routing may stay in existing tracker | Non-code coordination may belong to other skills/tools | Route non-board, non-code, or non-review-centric requests away early |
| Cleanup | Close/retry/merge should trigger explicit cleanup choice | Same | Same | Stale workspaces, dev servers, and branches must be cleaned up deliberately |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Card/workspace creation | Create isolated workspace and start chosen agent | Same | Same | Card start should create the execution context, not just a note |
| Status transitions | Running / idle / needs-attention states surfaced in board | Same | Same | Board state should track execution + review, not only TODO/DONE |
| Review feedback | Inline comments and retry loop | PR comment / retry loop | Review-note / retry loop | Review feedback must persist across retries |
| PR / merge handoff | Create or open PR after reviewable output exists | Same | Same | PR handoff is the durable integration point for coding workflows |
| Post-run cleanup | Branch/worktree/server cleanup after merge/close | Same | Same | Cleanup automation is valuable but must stay observable and reversible |

## Platform Gaps
- Claude, Codex, and Gemini differ mostly in authentication and MCP registration, not in the operator model; the common abstraction is stronger than the vendor differences.
- The bigger gap is not vendor-to-vendor but coding-board workflows vs non-code coordination workflows; PM, marketing, and game-production tasks often share board logic without sharing Git/worktree/PR primitives.
- Current `vibe-kanban` material over-emphasizes setup details relative to rules and hooks; a stronger skill should normalize those layers and make route-outs explicit.
