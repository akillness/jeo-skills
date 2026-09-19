# Repo Delivery and Runtime Loops

Use this reference when the workflow problem is mainly about moving from repo
inspection to edits, verification, and PR preparation without thrashing.

## Default repo-delivery loop

The smallest durable loop is:

1. inspect the relevant state
2. make one bounded change
3. verify with the smallest convincing check
4. review the diff
5. commit or prepare the PR

Keep the loop narrow. If the change or verification expands beyond one coherent
lane, split it before continuing.

## Shell vs edit vs browser verification

Use shell-first when:

- the task is file inspection, search, lint, test, build, or other deterministic
  local work
- the output needed is textual and repo-local

Use browser or runtime verification when:

- the claim is about rendered behavior or a running app
- stateful browser context matters
- user-visible interactions need confirmation

For live browser or runtime checks, prefer `playwriter` over fresh headless
automation when the active browser session matters.

## Worktrees and parallel lanes

Use worktrees when:

- two meaningful branches need to move in parallel
- you need clean separation between feature, hotfix, or review lanes
- one agent or session would otherwise keep stomping on another branch state

Do not use worktrees for a tiny one-file fix that can finish in one branch with
one agent.

Good worktree rules:

- one worktree per branch
- one clear owner per worktree at a time
- merge or close stale worktrees once their lane ends
- keep branch names meaningful enough to trace the lane later

## PR preparation loop

Before opening a PR:

1. re-check branch and working-tree state
2. run the target validation for the touched lane
3. inspect the diff for accidental scope creep
4. write a commit message that captures why the change exists
5. open the PR only after the bounded scope is clean

If the repo uses recurring maintenance lanes, record the current stage as one
of:

- survey
- improvement
- pr-open
- pr-review
- merge

## Runtime verification checklist

Before claiming success for a workflow that changed behavior:

- verify the relevant tests or builds if code changed
- verify the live runtime or browser behavior if UX changed
- verify the post-action repo state matches the intended lane
- record the next owner when the current run stops before merge
