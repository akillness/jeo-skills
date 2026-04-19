# Context: clawteam packet ratchet

## Workflow Context
`clawteam` matters when the user explicitly wants the ClawTeam runtime: leader/worker teams, task ownership, inbox messaging, git-worktree isolation, tmux or subprocess workers, board monitoring, and profile/preset-driven runtime setup. Upstream ClawTeam still teaches the workflow through concrete operator verbs like `team spawn-team`, `spawn`, `task create/update`, `inbox send`, `board attach/serve`, `launch`, and `profile` / `preset` flows rather than through a single generic orchestration abstraction.

Within `oh-my-skills`, that means `clawteam` should stay narrow: it owns the ClawTeam-specific operator surface, while broader plan→execute→QA orchestration belongs to `jeo`, `omc`, `omx`, or `ohmg`, board/governance work belongs to `vibe-kanban`, and lightweight parallel fan-out can use built-in delegation.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Developer operator | Split implementation, testing, and review work across leader + worker agents in one repo | Intermediate–advanced |
| Research/computation operator | Run template or multi-worker investigation loops and inspect their state | Intermediate–advanced |
| Product/ops or content coordinator | Use explicit task/inbox ownership for non-code research or launch work | Intermediate |
| `oh-my-skills` maintainer | Keep `clawteam` distinct from broader orchestration/router skills | Advanced |

## Current Workarounds
1. Route vague “multi-agent” asks to broader wrappers (`jeo`, `omc`, `omx`, `ohmg`) instead of using `clawteam` unless the runtime is explicit.
2. Read upstream README/issues directly when current command families or runtime caveats matter more than the local front door.
3. Track due dates, task templates, or bulk task administration outside ClawTeam; upstream requests show these workflows are still underpowered inside the runtime.
4. Inject manual loop language into worker tasks when users need long-running behavior that the runtime does not reliably preserve by itself.
5. Fall back to manual tmux/worktree inspection when state visibility or recovery matters more than abstraction.

## Adjacent Problems
- Boundary collision with broader orchestration/router skills when `clawteam` tries to answer generic swarm requests.
- Runtime truthfulness pressure: worker keepalive, config application, and interactive permission flows still leak through the abstraction.
- Task-governance gaps such as due dates, tags, history, bulk operations, and templates push users toward external PM habits.
- Trust and isolation concerns become more important as teams use inbox/worktree delegation with more workers.
- Cross-device/shared-state expectations can turn a local operator question into a broader transport/runtime architecture question.

## User Voices
- “Currently we track deadlines externally.” — ClawTeam issue #61: <https://github.com/HKUDS/ClawTeam/issues/61>
- “Worker agents ... still terminate after completing their first turn.” — ClawTeam issue #148: <https://github.com/HKUDS/ClawTeam/issues/148>
- “The agent definitions system ... fails to apply most of the parsed configuration when spawning subagents.” — ClawTeam issue #146: <https://github.com/HKUDS/ClawTeam/issues/146>
- “Can multiple agents ... on multiple devices within an intranet communicate with each other?” — ClawTeam issue #8: <https://github.com/HKUDS/ClawTeam/issues/8>
- “When 8 agents run autonomously across GPUs with zero human intervention, several attack vectors become relevant.” — ClawTeam issue #76: <https://github.com/HKUDS/ClawTeam/issues/76>

## Sources
- ClawTeam README: <https://github.com/HKUDS/ClawTeam/blob/main/README.md>
- ClawTeam quick start / use cases / architecture sections: <https://github.com/HKUDS/ClawTeam/blob/main/README.md>
- ClawTeam issues #8, #61, #76, #146, #148: linked above
- Repo-local boundary context: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/clawteam/SKILL.md`, `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/jeo/SKILL.md`, `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/omc/SKILL.md`, `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/omx/SKILL.md`, `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/ohmg/SKILL.md`, `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/vibe-kanban/SKILL.md`
