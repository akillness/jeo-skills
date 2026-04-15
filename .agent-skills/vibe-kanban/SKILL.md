---
name: vibe-kanban
description: >
  Run a board-first workflow for AI coding agents when the real job is managing
  task cards, isolated workspaces/worktrees, review queues, retries, and PR
  handoff — not just prompting one agent once. Use when the user needs a visual
  board or workspace control plane for parallel coding tasks, worktree hygiene,
  human review, or agent retries. Triggers on: kanban board, workspace board,
  agent task board, review queue, worktree board, parallel coding agents,
  card-based agent workflow, and vibe-kanban. Route planning-only requests to
  `plannotator` / `task-planning`, running-browser review to `agentation` or
  `playwriter`, and non-code PM / marketing / game-production coordination to
  their domain workflow skills.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: vibe-kanban, kanban, kanbanview, multi-agent, worktree, review-queue, github-pr, task-board, claude-code, codex, gemini, opencode
  platforms: Claude, Codex, Gemini, OpenCode
  keyword: kanbanview
  version: 2.0.0
  source: https://github.com/BloopAI/vibe-kanban
  modernization: 2026-04-15
---

# Vibe Kanban

`vibe-kanban` is the **board / workspace / review control-plane** skill for AI coding agents.

Use it when the hard part is not writing one prompt, but **coordinating multiple bounded coding tasks through a visible board, isolated workspaces, human review, retries, and PR handoff**.

Read these support docs before choosing the workflow:
- [references/modes-and-routing.md](references/modes-and-routing.md)
- [references/review-and-cleanup.md](references/review-and-cleanup.md)
- [references/tracker-and-non-code-boundaries.md](references/tracker-and-non-code-boundaries.md)
- [references/environment-variables.md](references/environment-variables.md)
- [references/mcp-api.md](references/mcp-api.md)

## When to use this skill
Use `vibe-kanban` when one or more of these are true:
- The user needs a **visual board** or **workspace queue** for AI coding tasks.
- The workflow requires **parallel workspaces/worktrees** instead of one long terminal session.
- A human must **review diffs, comments, retries, or PR handoff** for each task.
- The task needs a visible **To Do / Running / Review / Done** flow for coding agents.
- The operator wants one control plane for **branch isolation, agent assignment, review, and cleanup**.
- The request mentions kanban board, review queue, agent workspace, worktree cleanup, parallel coding agents, or `vibe-kanban`.

## When not to use this skill
- **The user only needs planning, task decomposition, or plan approval without a running board** → use `task-planning`, `survey`, `jeo`, or `plannotator`
- **The task is a single-agent coding run with no board/review/workspace need** → use the relevant coding/orchestration skill directly
- **The real requirement is browser review or authenticated browser reuse** → use `agentation`, `agent-browser`, or `playwriter`
- **The work is mostly PM / ops coordination without code worktrees, diffs, or PRs** → use PM workflow skills such as `task-planning`, `standup-meeting`, or `sprint-retrospective`
- **The work is mainly marketing/content operations** → use `marketing-automation` or adjacent GTM/content skills
- **The work is game-production planning without code-board execution** → use `bmad-gds` or other game-production skills

## Quick routing rule
| If the job needs... | Use |
|---|---|
| A board for bounded coding tasks with worktrees, review, retries, and PR handoff | `vibe-kanban` |
| Plan review or artifact approval before coding begins | `plannotator` |
| One agent task with no board/workspace control plane | direct coding/orchestration skill |
| Exact rendered-UI review or browser-state reuse | `agentation` / `playwriter` / `agent-browser` |
| Non-code work coordination (PM, marketing, game ops) | the matching domain workflow skill |

## Instructions

### Step 1: Confirm the board is the real need
Normalize the request before opening a board or configuring MCP.

```yaml
vibe_kanban_mode:
  board_need: coding-board | tracker-sync | review-queue | compare-agents | unknown
  task_shape: single-bounded-task | several-independent-tasks | epic-needs-splitting | unknown
  review_surface: board-review | PR-review | both | unknown
  repo_scope: one-repo | several-repos | no-repo | unknown
  agent_mix: claude | codex | gemini | opencode | mixed | unknown
  cleanup_need: low | medium | high | unknown
```

Choose `vibe-kanban` only if the workflow truly needs a **coding board**. If the task is still a vague epic, split it before the board becomes noise.

### Step 2: Keep the unit of work small
One card/workspace should own **one bounded coding task**.

Good card shapes:
- implement one API endpoint
- fix one failing test cluster
- build one isolated UI component
- compare two agent attempts on one feature branch

Bad card shapes:
- “finish the whole migration”
- “build the entire product”
- “do growth strategy + marketing copy + launch board”

If the work is too large, use a planning skill first, then return with smaller tasks.

### Step 3: Set up the board around one repo and one base branch
Use the smallest useful setup.

```bash
npx vibe-kanban
# or
PORT=3001 npx vibe-kanban --port 3001
```

Rules:
- prefer one repo + one base branch per workspace/card
- keep preview/app ports separate from the board port
- make agent credentials explicit before launch
- avoid remote exposure unless the operator actually needs it

Use the support docs for low-level setup instead of bloating the main workflow:
- env vars: [references/environment-variables.md](references/environment-variables.md)
- MCP API / tool names: [references/mcp-api.md](references/mcp-api.md)

### Step 4: Treat cards as workspace contracts
When creating a card/workspace, include:
- the exact task outcome
- the repo + base branch
- the chosen agent
- key constraints or acceptance checks
- whether review should happen in-board, in PR, or both

Minimal example:

```text
Title: Fix signup validation regression
Goal: Restore server-side validation for missing email/phone on /signup
Acceptance: failing tests pass, new regression test added, PR ready for review
Agent: Claude Code
```

A vague card becomes a vague workspace. Make the review target obvious before the agent starts.

### Step 5: Use the core board loop
Follow the same operator loop every time:
1. **Create or refine a bounded card**
2. **Start one workspace** for that card
3. **Observe logs + diffs** while it runs
4. **Review in the board or PR**
5. **Retry, split, or approve** based on evidence
6. **Merge / close / clean up** explicitly

The board is useful only if status changes reflect real work:
- **To Do / backlog** — not started
- **Running / In Progress** — agent owns an isolated workspace
- **Review / Needs attention** — waiting on human judgment or retry choice
- **Done / merged / closed** — resolved, with cleanup completed

### Step 6: Decide how review happens
Pick one primary review surface before the card starts.

| Review mode | Use when | Risk |
|---|---|---|
| **Board-first review** | Fast local iteration and retry loop matter more than GitHub ceremony | Can hide history if comments are not preserved |
| **PR-first review** | Team collaboration, branch protections, or durable code-review trail matter most | Slower for rapid retries |
| **Board then PR** | You want quick triage first, then a durable final review surface | More steps, but usually safest for shared repos |

Review rules:
- compare the output to the card contract, not just whether files changed
- prefer retrying or splitting a card over letting one workspace drift forever
- preserve human comments if the platform supports it; otherwise copy the decision back into the task record
- do not merge just because the board says “done”

### Step 7: Manage parallel workspaces deliberately
Parallelism is useful when tasks are independent, not when several agents are stepping on the same concern.

Use parallel workspaces when:
- the tasks touch different files or areas
- you want to compare two agents on the same bounded task
- the review queue can keep up with the number of active cards

Avoid parallelism when:
- all work depends on one unstable branch
- the same preview/dev server will collide
- the operator cannot actually review the resulting diffs

### Step 8: Keep worktree and branch cleanup explicit
Board workflows create operational mess if cleanup is hand-waved.

After closing or merging a workspace, check:
- stale `vk/*` branches
- stale worktrees
- stale preview/dev servers
- comments or retry notes that would be lost if the card closes silently

If a workspace is confused or polluted, prefer **close + recreate a smaller card** over endlessly retrying a bad context.

### Step 9: Use MCP only when direct board control helps
MCP mode is useful when another agent or orchestrator should create cards, move statuses, or inspect board state. It is not the first thing to reach for on every run.

Use MCP when:
- you want an orchestrator to manage card lifecycle programmatically
- several agent tools need a shared board state
- board updates should be driven by higher-level automation

Do not start with MCP when the operator only needs a local board UI and a small number of manual workspace runs.

### Step 10: Route out honestly
`vibe-kanban` should stay narrow enough to be useful.

Route out when the request is really about:
- plan creation or approval → `task-planning`, `survey`, `plannotator`
- code review without a board/workspace loop → `code-review`
- browser review or QA evidence → `agentation`, `agent-browser`, `playwriter`
- PM-only standups / retros / sprint process → PM skills
- marketing/content pipeline coordination without coding workspaces → `marketing-automation`
- game-production planning without coding board control → `bmad-gds`

## High-value command patterns

### Start local board on a safe port
```bash
PORT=3001 npx vibe-kanban --port 3001
```

### Run MCP server for orchestrators
```bash
npx vibe-kanban --mcp
```

### Check worktree state when cleanup gets messy
```bash
git worktree list
git worktree prune
```

### Run via repo helper scripts
```bash
bash scripts/start.sh
bash scripts/health-check.sh
bash scripts/cleanup.sh
```

## Troubleshooting
| Issue | What to check |
|---|---|
| Board feels noisy and cards keep stalling | Split cards smaller and reduce parallel workspaces |
| Review takes too long | Move to PR-first review or reduce active card count |
| Branch/worktree mess accumulates | Run cleanup, prune worktrees, and close stale cards explicitly |
| Preview servers collide | Separate board port from app preview ports and avoid overlapping workspaces |
| Non-code requests keep landing here | Strengthen route-outs to PM, marketing, or game-production skills |
| MCP adds more complexity than value | Use the board UI directly and skip MCP for small/local runs |

## Examples

### Example 1: Parallel coding-agent board
- Prompt: “Set up a board so Claude and Codex can each take one of these three independent frontend bug fixes, and I can review diffs before opening PRs.”
- Expected behavior: use `vibe-kanban`, break work into bounded cards, keep workspaces isolated, and choose a board-review → PR handoff loop.

### Example 2: Compare two agents on one bounded task
- Prompt: “Run two agents against the same API bug so I can compare their diffs before deciding which PR to keep.”
- Expected behavior: use `vibe-kanban`, create a comparison-friendly board setup, and keep review criteria explicit.

### Example 3: Pure planning request
- Prompt: “Help me break this migration into phases and get sign-off before any code is written.”
- Expected behavior: route away to `task-planning` or `plannotator`, because the board is premature.

### Example 4: Marketing workflow with no coding board
- Prompt: “I need a board for content calendar approvals and launch copy revisions.”
- Expected behavior: route away to `marketing-automation` or a PM/content workflow skill, because `vibe-kanban` is for coding workspaces, diffs, and PR review.

## Best practices
1. Choose `vibe-kanban` because a board/workspace/review loop matters, not because the word “kanban” appears.
2. Keep one bounded coding task per card whenever possible.
3. Decide the review surface before the agent starts.
4. Treat retries as evidence-driven decisions, not a default reflex.
5. Limit parallelism to what the human can actually review.
6. Clean up branches, worktrees, and stale cards deliberately.
7. Route PM-only, marketing-only, and non-code game-production workflows away early.
8. Use MCP as an automation layer, not as a prerequisite for basic value.

## References
- Vibe Kanban upstream: https://github.com/BloopAI/vibe-kanban
- OpenAI Codex Jira↔GitHub workflow: https://developers.openai.com/cookbook/examples/codex/jira-github
- GitHub agentic workflows: https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/
- VS Code Agent Kanban: https://github.com/appsoftwareltd/vscode-agent-kanban
- Better Stack / Beads on task tracking for AI coding agents: https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/
