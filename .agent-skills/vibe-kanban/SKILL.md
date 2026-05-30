---
name: vibe-kanban
description: >
  Run a coding-board control plane when the real job is managing bounded coding
  cards, isolated workspaces/worktrees, review queues, retries, and PR handoff
  — not just prompting one agent once. Use when the user needs a visual board or
  tracker-linked workspace loop for parallel coding tasks, agent comparison, or
  review-heavy handoff. Triggers on: kanban board, coding board, workspace board,
  review queue, tracker sync for coding tasks, worktree board, parallel coding
  agents, card-based agent workflow, and vibe-kanban. Route planning-only
  requests to `task-planning` / `survey` / `plannotator`, browser/UI execution to
  `agentation` / `browser-harness` / `playwriter`, and non-code PM / marketing /
  game-production coordination to their domain skills.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: vibe-kanban, kanban, kanbanview, multi-agent, worktree, review-queue, github-pr, task-board, claude-code, codex, gemini, opencode
  platforms: Claude, Codex, Gemini, OpenCode
  keyword: kanbanview
  version: 2.1.0
  source: https://github.com/BloopAI/vibe-kanban
  modernization: 2026-04-15
  structural_hardening: 2026-04-18
---

# Vibe Kanban

`vibe-kanban` is the **coding-board / workspace / review control-plane** skill.

Use it when the hard part is coordinating **bounded coding tasks through a visible board, isolated workspaces, human review, retries, and PR handoff**.

Read these support docs before you pick the workflow shape:
- [references/modes-and-routing.md](references/modes-and-routing.md)
- [references/board-packets-and-surface-selection.md](references/board-packets-and-surface-selection.md)
- [references/review-and-cleanup.md](references/review-and-cleanup.md)
- [references/tracker-and-non-code-boundaries.md](references/tracker-and-non-code-boundaries.md)
- [references/environment-variables.md](references/environment-variables.md)
- [references/mcp-api.md](references/mcp-api.md)

## When to use this skill
Use `vibe-kanban` when one or more of these are true:
- The user needs a **visual board** or **workspace queue** for coding tasks.
- The workflow requires **parallel workspaces/worktrees** instead of one long agent session.
- A human must **review diffs, retries, or PR handoff** across several coding cards.
- The operator wants one control plane for **branch isolation, agent assignment, review, and cleanup**.
- The board should stay linked to an existing tracker **without replacing it as the PM source of truth**.
- The request mentions kanban board, review queue, worktree board, coding tracker sync, parallel coding agents, or `vibe-kanban`.

## When not to use this skill
- **Planning, decomposition, or sign-off comes before any coding board** → use `task-planning`, `survey`, `jeo`, or `plannotator`
- **The task is a single-agent coding run with no board/review/workspace need** → use the relevant coding/orchestration skill directly
- **The real requirement is browser review or authenticated browser reuse** → use `agentation`, `browser-harness`, or `playwriter`
- **The work is mostly PM / ops coordination without coding workspaces, diffs, or PRs** → use PM workflow skills such as `task-planning`, `standup-meeting`, or `sprint-retrospective`
- **The work is mainly marketing/content operations** → use `marketing-automation` or adjacent GTM/content skills
- **The work is game-production planning without coding-board execution** → use `bmad-gds` or other game-production skills

## Quick routing rule
| If the job needs... | Use |
|---|---|
| A board for bounded coding tasks with worktrees, review, retries, and PR handoff | `vibe-kanban` |
| Plan review or artifact approval before coding begins | `plannotator` |
| One agent task with no board/workspace control plane | direct coding/orchestration skill |
| Exact rendered-UI review or browser-state reuse | `agentation` / `playwriter` / `browser-harness` |
| Non-code work coordination (PM, marketing, game ops) | the matching domain workflow skill |

## Instructions

### Step 1: Confirm that the board is the real need
Normalize the request before opening a board or configuring MCP.

```yaml
vibe_kanban_mode:
  board_need: coding-board | tracker-sync | review-queue | compare-agents | unknown
  task_shape: single-bounded-task | several-independent-tasks | epic-needs-splitting | unknown
  review_surface: board-review | PR-review | board-then-PR | unknown
  repo_scope: one-repo | several-repos | no-repo | unknown
  agent_mix: claude | codex | gemini | opencode | mixed | unknown
  cleanup_need: low | medium | high | unknown
```

Choose `vibe-kanban` only if the workflow truly needs a **coding board**. If the task is still a vague epic, split it before the board becomes noise.

### Step 2: Keep one bounded coding task per card
Good cards have one reviewable outcome:
- one API endpoint
- one failing test cluster
- one isolated UI component
- one comparison between two agents on one task

Bad cards are giant epics such as “finish the migration” or mixed non-code/coding workflows.

### Step 3: Pick the board packet and review surface
Use [references/board-packets-and-surface-selection.md](references/board-packets-and-surface-selection.md) to choose among:
- **parallel coding cards**
- **agent comparison**
- **review queue**
- **tracker sync**

Default to **board-then-PR** when quick local iteration matters but the final review still belongs in GitHub.

### Step 4: Treat each card as a workspace contract
Every card should capture:
- exact goal and acceptance checks
- repo + base branch
- chosen agent
- review surface
- cleanup owner
- tracker link if an external board remains canonical

Minimal card example:

```text
Title: Fix signup validation regression
Goal: Restore server-side validation for missing email/phone on /signup
Acceptance: failing tests pass, new regression test added, PR ready for review
Agent: Claude Code
Review: board-then-PR
```

### Step 5: Run the board loop
1. Create or refine a bounded card
2. Start one isolated workspace for that card
3. Observe logs and diffs
4. Review against the card contract
5. Retry, split, approve, or hand off to PR review
6. Clean up branches/worktrees/servers explicitly

### Step 6: Keep review and cleanup honest
Use [references/review-and-cleanup.md](references/review-and-cleanup.md) for the acceptance loop. The short rule:
- compare output to the card contract, not just whether files changed
- prefer retry or split over letting one workspace drift forever
- do not treat board status as proof that the work is done
- close stale cards and prune stale worktrees on purpose

### Step 7: Use MCP only when shared board control helps
Start with the UI or local workflow first. Bring in MCP when another orchestrator needs to create cards, inspect state, or move work programmatically.

### Step 8: Route out honestly
Keep `vibe-kanban` narrow enough to stay useful.
- plan creation or approval → `task-planning`, `survey`, `plannotator`, `jeo`
- code review without a board/workspace loop → `code-review`
- browser review or QA evidence → `agentation`, `browser-harness`, `playwriter`
- PM-only rituals or roadmap coordination → PM skills
- marketing/content pipeline coordination without coding workspaces → `marketing-automation`
- game-production planning without coding-board control → `bmad-gds`

## High-value command patterns
```bash
# start local board on a safe port
PORT=3001 npx vibe-kanban --port 3001

# run MCP server for orchestrators
npx vibe-kanban --mcp

# inspect worktree cleanup state
git worktree list
git worktree prune
```

## Examples

### Example 1: Parallel coding board
- Prompt: “Set up a board so Claude and Codex can each take one of these three independent bug fixes, and I can review diffs before opening PRs.”
- Expected behavior: use `vibe-kanban`, create bounded cards, keep workspaces isolated, and choose a board-review → PR handoff loop.

### Example 2: Agent comparison
- Prompt: “Run two agents against the same API bug so I can compare their diffs and decide which PR to keep.”
- Expected behavior: use `vibe-kanban`, preserve isolated attempts, and make the review decision explicit.

### Example 3: Planning only
- Prompt: “Help me break this migration into phases and get sign-off before any code is written.”
- Expected behavior: route to `task-planning` or `plannotator`, because the board is premature.

### Example 4: Marketing board
- Prompt: “I need a board for content calendar approvals and launch copy revisions.”
- Expected behavior: route to `marketing-automation` or PM/content workflow skills, because `vibe-kanban` is for coding workspaces, diffs, and PR handoff.

### Example 5: Tracker-linked coding board
- Prompt: “Keep GitHub Projects as the source of truth, but open a coding board for three worktree-isolated feature cards and hand each finished card to PR review.”
- Expected behavior: keep the tracker canonical, use `vibe-kanban` for coding execution state, and preserve explicit cleanup/PR handoff.

## Best practices
1. Keep one bounded coding outcome per card.
2. Treat GitHub Projects / Linear / Jira as external trackers, not proof that a coding board is unnecessary.
3. Limit active cards to what one reviewer can realistically absorb.
4. Preserve retry decisions and comments somewhere durable.
5. Prefer board-then-PR for fast iteration on shared repos.
6. Clean up worktrees, branches, and preview servers as part of the workflow.
7. Route PM, marketing, and non-code game-production boards away early.

## References
- [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)
- [Git worktree documentation](https://git-scm.com/docs/git-worktree)
- [Claude Code common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
- [GitHub Projects docs](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects)
- [GitHub merge queue docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue)
