---
name: git-workflow
description: >
  Route local Git work into the safest next move: branch hygiene, selective staging,
  commit cleanup, merge-vs-rebase choice, conflict resolution, lease-safe pushes,
  and recovery from resets or bad history edits. Use when the user needs help
  preparing a branch, cleaning up commits, syncing with an updated base, resolving
  local Git conflicts, pushing rewritten history safely, recovering lost commits,
  or getting a diff ready for review. Not for hosted PR review, repo
  administration, or sprint planning.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best when Git CLI is available and the real problem is local repository state:
  branch shape, worktree/index cleanup, history edits, sync decisions, conflict
  handling, or recovery.
metadata:
  tags: git, version-control, branching, commits, rebasing, conflict-resolution, recovery, collaboration
  platforms: Claude, ChatGPT, Gemini, Codex, OpenCode
  version: "1.2"
  source: akillness/jeo-skills
---

# Git Workflow

Use this skill as the repo's **routing-first local Git collaboration and recovery anchor**.

The job is not to teach all of Git. The job is to:
- identify the current local Git state quickly,
- choose one safe workflow mode,
- recommend the smallest reversible fix that solves the problem,
- keep boundaries to review, debugging, planning, and hosted PR workflows explicit.

Read these references when the case gets sharp-edged or the user needs more than the brief:
- [references/collaboration-boundaries.md](references/collaboration-boundaries.md)
- [references/mode-selection-and-command-packets.md](references/mode-selection-and-command-packets.md)
- [references/recovery-patterns.md](references/recovery-patterns.md)

If the main need is:
- **reviewing a diff for correctness, architecture, or security** → route to `code-review`
- **reproducing or diagnosing a bug/regression** → route to `debugging`
- **planning tasks, acceptance criteria, or sprint slices** → route to `task-planning`
- **Aider 기반 AI pair-programming 편집 루프 운영** → route to `aider-cli-workflow`
- **hosted PR lifecycle, branch protection, reviewers, labels, or repo settings** → use a dedicated PR/repo-management workflow

## When to use this skill
- Create, rename, or clean up a branch before coding or review
- Stage changes selectively and shape reviewable commits
- Decide whether to merge or rebase onto an updated base branch
- Resolve merge/rebase conflicts safely
- Push a branch, set upstream, or update rewritten history with `--force-with-lease`
- Recover from a bad reset, wrong-branch commit, detached HEAD, dropped commit, or messy rebase
- Prepare a clean diff before a later PR or review step

## When not to use this skill
- The real question is whether the code or architecture is good
- The real question is how to split or sequence the work
- The real question is root cause, not Git mechanics
- The real question is hosted-service workflow instead of local repository state
- The user wants a giant Git tutorial instead of the next safe move

## Instructions

### Step 1: Normalize the local Git intake
Classify the request before suggesting commands.

```yaml
git_intake:
  current_goal: branch-setup | commit-shaping | sync-with-base | conflict-resolution | push-safety | undo-recovery | history-inspection | unknown
  branch_state: clean | has-unstaged-changes | staged-only | ahead-of-origin | behind-origin | diverged | detached-head | unknown
  collaboration_risk: solo-branch | shared-branch | unknown
  remote_context: no-remote | origin-only | fork-plus-upstream | unknown
  trigger_event:
    - need-clean-commits
    - rebased-branch
    - merge-conflict
    - wrong-branch-commit
    - accidental-reset
    - rejected-push
    - lost-commit
    - prepare-for-review
    - sync-main
    - unclear
  preferred_history: keep-linear | preserve-merge-context | unknown
  confidence: high | medium | low
```

If the packet is incomplete, choose the safest reasonable next move and state the assumptions.

### Step 2: Choose one primary workflow mode
Pick exactly one mode:

1. **branch-and-stage hygiene** — branch creation/switching, staging, stash-or-clean decisions
2. **commit-shaping** — amend, fixup, reword, interactive rebase, cleaner review units
3. **sync-with-base** — fetch + merge/rebase choice when the branch must catch up
4. **conflict-resolution** — merge/rebase already produced conflicts; the next safe loop matters most
5. **push-safety** — upstream setup, rejected pushes, diverged branches, rewrite-safe pushes
6. **undo-and-recovery** — reset/rebase/amend/checkout/branch deletion went sideways; rescue first

### Step 3: Use the safety ladder
Always prefer these checks before irreversible actions:
- `git status`
- `git branch --show-current`
- `git log --oneline --decorate -5`

Core rules:
- Prefer `git add -p` or explicit staging when commit boundaries matter.
- Prefer amend or interactive rebase only on local or safely rewritable history.
- Prefer rebase when the branch is mostly yours and a cleaner review history helps.
- Prefer merge when the branch is shared or preserving integration context matters more than linear history.
- Prefer `git push --force-with-lease`, never raw `--force`, after intentional history rewrites.
- Prefer `git revert` over `reset --hard` when the bad commit is already shared.
- Prefer `git reflog` and a rescue branch before panic cleanup.

### Step 4: Apply the decision ladder
Use these callouts explicitly:

#### Merge vs rebase
- **Use rebase** when rewrite risk is low and reviewable linear history matters.
- **Use merge** when the branch is shared, integration context matters, or rewrite risk is not worth it.

#### Revert vs reset
- **Use revert** for collaborative undo on already-pushed history.
- **Use reset** only when rewriting local history intentionally.
- **Use restore / checkout of files** when the worktree/index needs repair more than the branch history.

#### Normal push vs `--force-with-lease`
- **Use normal push** when history was not rewritten.
- **Use `--force-with-lease`** after rebase, amend, squash, or another intentional rewrite.
- If the branch may be shared and the remote state is unclear, stop and name the collaboration risk.

### Step 5: Build the Git Workflow Brief
Return this exact structure:

```markdown
# Git Workflow Brief

## Recommended mode
- Mode: branch-and-stage hygiene | commit-shaping | sync-with-base | conflict-resolution | push-safety | undo-and-recovery
- Why this mode fits: ...

## Current state
- Branch: ...
- Worktree / index state: ...
- Remote context: ...
- Collaboration risk: solo-branch | shared-branch | unknown
- Confidence: high | medium | low

## Safest next move
1. ...
2. ...
3. ...

## Commands
```bash
...
```

## Why this is the safe path
- ...
- ...

## Watch-outs
- ...
- ...

## Recovery fallback
- If this goes wrong, use ...

## Adjacent handoff
- Use `code-review` when ...
- Use `debugging` when ...
- Use `task-planning` when ...
```

### Step 6: Use concise mode packets
- **branch-and-stage hygiene** — branch name, dirty/clean state, selective staging, stash only when it lowers risk
- **commit-shaping** — reviewable commit units, amend/fixup/rebase only when rewrite is safe
- **sync-with-base** — fetch first, decide merge vs rebase explicitly, name rewrite risk before starting
- **conflict-resolution** — inspect → resolve → `git add` → continue/commit, with `abort` as the calm fallback
- **push-safety** — distinguish upstream creation, normal push, rejected push, and rewritten-history push
- **undo-and-recovery** — identify what moved, inspect `reflog`, create a rescue branch, prefer reversible steps first

Use the detailed command packets in [references/mode-selection-and-command-packets.md](references/mode-selection-and-command-packets.md) when you need the expanded workflow.

### Step 7: Keep boundaries sharp
Before finalizing:
- Do **not** turn this into a hosted PR tutorial.
- Do **not** pretend every branch should be rebased.
- Do **not** recommend `reset --hard` casually without naming the data-loss risk.
- Do **not** hide the solo-vs-shared branch distinction.
- Do **not** drift into code-review judgment, root-cause analysis, or backlog design.

## Output format
Always return a compact **Git Workflow Brief**, not a giant command dump.

Required qualities:
- choose one mode
- state the collaboration risk
- prefer the safest reversible path that solves the current problem
- make rewrite risk explicit
- include a recovery fallback when the commands have teeth
- keep routing boundaries to review, debugging, planning, and hosted PR workflows visible

## Examples

### Example 1: rebased branch needs safe push
**Input**
> I rebased my feature branch onto main and now I need to push it without overwriting teammates.

**Output sketch**
- Mode: `push-safety`
- State whether the branch looks solo or shared
- Recommend `git push --force-with-lease origin <branch>` only if rewrite is expected
- Watch-out warns against raw `--force`

### Example 2: clean up local commits before review
**Input**
> Help me turn these messy local commits into something clean before review.

**Output sketch**
- Mode: `commit-shaping`
- Suggest explicit staging plus `git rebase -i` or `git commit --amend`
- Keep the goal focused on reviewable commit units, not review comments themselves

### Example 3: wrong-branch reset panic
**Input**
> I think I hard-reset the wrong branch. Can Git recover this?

**Output sketch**
- Mode: `undo-and-recovery`
- Start with `git reflog`
- Create a rescue branch from the pre-reset SHA before further cleanup
- Explain when to stop and avoid more destructive commands

### Example 4: request is really PR review
**Input**
> Review this PR and tell me if the architecture is okay.

**Output sketch**
- Route away from `git-workflow`
- Explain that local Git prep is not the main problem here
- Hand off to `code-review`

## Best practices
1. **Inspect before surgery.** Status, branch, and recent log beat guesswork.
2. **Prefer reviewable commits over giant snapshots.** Commit shape affects review quality.
3. **Treat history rewrites as collaboration decisions, not personal preferences.** Shared branches change the answer.
4. **Use `--force-with-lease`, not raw `--force`.** Rewrite safely or do not rewrite.
5. **Reach for `reflog` early in recovery.** Lost commits are often only misplaced pointers.
6. **Choose the smallest safe fix.** Not every problem needs branch surgery.
7. **Route out when the problem changes.** Review, debugging, planning, and hosted PR work stay separate.

## References
- [references/collaboration-boundaries.md](references/collaboration-boundaries.md)
- [references/mode-selection-and-command-packets.md](references/mode-selection-and-command-packets.md)
- [references/recovery-patterns.md](references/recovery-patterns.md)
- Git documentation — https://git-scm.com/docs
- GitHub Docs, *Resolving merge conflicts after a Git rebase* — https://docs.github.com/en/get-started/using-git/resolving-merge-conflicts-after-a-git-rebase
- GitLab Docs, *Resolve conflicts from the command line* — https://docs.gitlab.com/topics/git/git_rebase/#resolve-conflicts-from-the-command-line
