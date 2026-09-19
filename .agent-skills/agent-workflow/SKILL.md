---
name: agent-workflow
description: >
  Plan and improve day-to-day AI coding-agent workflow across Claude Code,
  Codex, Gemini CLI, and MCP-heavy repos: session startup, context recovery,
  fast repo loops, runtime verification, worktree use, and multi-agent
  handoffs. Use when the user wants a practical operating workflow, even if
  they ask in shorthand like shortcuts, session reset, agent setup, MCP usage,
  parallel agents, or better daily flow. Triggers on: agent workflow,
  productivity, context management, session recovery, worktree, MCP, multi-agent.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: agent-workflow, productivity, session-management, mcp, worktree, multi-agent
  platforms: Claude, Gemini, ChatGPT, Codex
  version: 2.0.0
  source: Claude Code Complete Guide - 70 tips (ykdojo + Ado Kukic)
---

# AI Agent Workflow

Agent-workflow requests are usually about choosing the smallest repeatable loop
that keeps the agent effective: start the session cleanly, keep repo work
grounded, use the right execution surface, and recover quickly when context or
tooling drifts. Keep the entrypoint focused on workflow triage and load the
references only when the user needs exact command recipes or deeper patterns.

## When to use this skill

- Set up a clean daily workflow for Claude Code, Codex, Gemini CLI, or a
  mixed-agent toolchain
- Recover from context overload, bad session hygiene, or tool sprawl
- Decide how to split work across chat, shell, MCP, worktrees, and multiple
  agents
- Choose a practical repo-delivery loop for edit, test, review, and PR work
- Improve runtime verification habits, especially when a live browser or app
  matters

Prefer a narrower sibling skill when the main job is more specific:

- `git-workflow` for branch, commit, rebase, push, and PR coordination
- `agent-configuration` for hooks, permissions, skills, plugins, and project
  instruction files
- `playwriter` when browser or runtime verification should use the live browser
  session
- `clawteam`, `omg`, `omx`, or `ohmg` when the user explicitly wants an
  orchestrated team workflow rather than a general operating loop

## Instructions

### Step 1: Classify the workflow request before prescribing commands

Sort the request into one or two primary lanes:

- session-control: startup, context reset, prompt hygiene, resume, handoff
- repo-delivery: inspect, edit, test, verify, commit, PR
- tools-and-runtime: shell vs MCP vs browser vs extension surface
- multi-agent: delegation, worktrees, role split, synthesis

Ground the workflow with the active agent surface, current repo state, and the
pain point that is slowing the user down. Do not dump a universal command list
before the workflow lane is clear.

### Step 2: Choose the smallest operating loop that fits

Use these defaults unless the environment proves otherwise:

- start with the lightest loop that can finish the job safely
- keep read-only inspection cheap before switching to edits or broad tool use
- prefer one bounded branch or worktree per meaningful change lane
- keep browser verification explicit when runtime behavior matters
- recover from context drift by resetting or handing off, not by piling more
  instructions into the same polluted session

### Step 3: Pull the matching reference, not the whole package

Load only the reference that matches the user's job:

- `references/session-and-context-management.md` for startup, reset, resume,
  handoff, and context hygiene
- `references/repo-delivery-and-runtime-loops.md` for shell, test, PR,
  worktree, and live-verification workflow patterns
- `references/mcp-and-multi-agent-patterns.md` for MCP usage, delegation,
  specialist routing, and cross-agent orchestration

### Step 4: Keep workflow advice grounded in the actual surface

Before recommending a loop, confirm the relevant runtime facts:

- which agent or CLI is active
- whether the job is read-only, implementation, review, or verification
- whether a repo, remote, branch, or running app is already in play
- whether the browser or runtime check should use `playwriter` instead of a
  fresh headless browser

Do not prescribe worktree, PR, MCP, or multi-agent flows as generic defaults
when the task is small enough to finish directly.

### Step 5: Verify the workflow result

After choosing or applying the workflow, verify with the smallest relevant
checks:

- repo state or branch state if the workflow touched code
- test or build status if the workflow included implementation
- browser or runtime checks when the workflow claims behavior changed
- explicit next owner or handoff state when the loop is not fully local

Do not claim the workflow is improved until the post-action state matches the
intended operating lane.

## Examples

### Example 1: Recover a polluted session

Input:

```text
My agent session is getting slow and confused. What workflow should I use to
reset without losing useful context?
```

Expected shape:

- classifies this as a session-control problem first
- recommends reset, resume, or handoff tactics instead of piling on prompts
- preserves only the context needed for the next bounded task

### Example 2: Pick a repo-delivery loop

Input:

```text
What is a good daily workflow for using Claude or Codex to inspect code, make a
change, run tests, and open a PR without the session getting messy?
```

Expected shape:

- picks a compact inspect-edit-verify-commit loop
- uses worktrees or branches only when the scope justifies them
- includes verification before PR creation

### Example 3: Decide between shell, MCP, and browser surfaces

Input:

```text
I can use shell tools, MCP servers, or browser automation. How should I decide
which workflow to use for a task?
```

Expected shape:

- distinguishes read-only shell work from external-service or runtime needs
- keeps MCP or browser usage scoped to tasks that actually benefit from them
- routes live browser verification to `playwriter` when the active session
  matters

### Example 4: Split a multi-agent task

Input:

```text
I want one agent researching, another implementing, and another validating.
What workflow keeps that from turning into chaos?
```

Expected shape:

- classifies this as a multi-agent workflow problem
- recommends bounded ownership, artifact handoff, and synthesis checkpoints
- avoids parallelizing work that is still on the critical path

## Best practices

1. Start from the actual bottleneck, not a memorized command catalog
2. Keep the primary loop small: inspect, act, verify, summarize
3. Use worktrees and multi-agent splits only when they reduce contention or
   waiting
4. Prefer live-browser verification via `playwriter` when runtime behavior
   matters
5. Reset or hand off polluted context instead of dragging stale assumptions
   forward
6. Keep detailed command recipes and platform-specific examples in references
   so the entrypoint stays compact and triggerable

## References

- `references/session-and-context-management.md`
- `references/repo-delivery-and-runtime-loops.md`
- `references/mcp-and-multi-agent-patterns.md`
- [Claude Code docs](https://code.claude.com/docs/)
- [OpenAI Codex docs](https://developers.openai.com/codex/)
- [Gemini CLI docs](https://google-gemini.github.io/gemini-cli/docs/)
