---
name: git-workflow
description: >
  Manage local Git collaboration safely: branch creation, staging, commit shaping,
  rebase/merge decisions, conflict resolution, lease-safe pushes, and recovery from
  resets or bad history edits. Use when the user needs help preparing a branch,
  cleaning up commits, rebasing onto an updated base branch, resolving conflicts,
  pushing rewritten history safely, undoing or recovering Git mistakes, or getting
  a diff ready for review. Not for hosted PR review, repo administration, or sprint
  planning.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Best for repositories where Git CLI is available and the main problem is local
  repository state: branches, commits, history edits, conflict handling, or recovery.
  This skill is a local Git workflow and recovery guide, not a hosted PR or repo-
  settings workflow.
metadata:
  tags: git, version-control, branching, rebasing, conflict-resolution, recovery, collaboration
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.1"
  source: akillness/oh-my-skills
---

# Git Workflow

Use this skill as the repository's **local Git collaboration and recovery anchor**.

The job is not to dump every Git command ever made. The job is to:
- choose the safest local Git move for the current state,
- keep branches and commits reviewable,
- handle rebases and conflicts without clobbering teammates,
- recover cleanly when resets, rebases, or force-pushes go sideways.

Read [references/collaboration-boundaries.md](references/collaboration-boundaries.md) and [references/recovery-patterns.md](references/recovery-patterns.md) before unusual cases or when choosing between merge, rebase, revert, reset, or reflog recovery.

If the user mainly needs:
- **what work should exist before touching Git** → route to `task-planning`
- **reviewing a diff for correctness, design, or security** → route to `code-review`
- **root-cause analysis of a bug or regression** → route to `debugging` (keep `git bisect` here only as the Git mechanic)
- **hosted PR lifecycle, reviewer assignment, or repo settings** → use a dedicated PR/repo-management workflow instead of this skill

## When to use this skill
- Create or rename a branch and choose a safe branch naming convention
- Stage changes selectively and shape commits into reviewable units
- Clean up local history before review with amend, interactive rebase, squash, or fixup
- Rebase or merge onto an updated base branch and resolve conflicts safely
- Push a branch, set upstream, or force-push rewritten history with `--force-with-lease`
- Recover from a bad reset, wrong-branch commit, dropped commit, or broken rebase using `reflog`, revert, restore, or rescue branches
- Prepare a branch/diff so the next review or PR step is clean and low-surprise

## When not to use this skill
- The main task is deciding whether the code/design/test approach is good → use `code-review`
- The main task is planning backlog slices, acceptance criteria, or sequencing → use `task-planning`
- The main task is reproducing and diagnosing a defect → use `debugging`
- The main task is GitHub/GitLab PR templates, reviewers, merge queues, branch protections, labels, or repo settings → use a hosted PR/repo-management workflow
- The user wants a giant Git tutorial instead of the next safe move for the current state

## Instructions

### Step 1: Classify the local Git situation
Normalize the request into this intake first:

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

If the user provides an unclear packet, choose the safest local next move and state the assumptions.

### Step 2: Choose one primary workflow mode
Pick exactly one mode for the current run:

1. **branch-and-stage hygiene**
   - Use when the main need is branch creation, switching, staging, partial staging, or keeping the worktree clean

2. **commit-shaping**
   - Use when the user needs better commit boundaries, better messages, amend/fixup, or interactive rebase cleanup before review

3. **sync-with-base**
   - Use when the branch must catch up with `main` / `origin/main` via merge or rebase

4. **conflict-resolution**
   - Use when a merge or rebase already produced conflicts and the next safe move matters most

5. **push-safety**
   - Use when the branch is ready but remote collaboration safety matters: upstream, rejected pushes, `--force-with-lease`, fork sync, or diverged branch handling

6. **undo-and-recovery**
   - Use when a reset, rebase, checkout, amend, or branch deletion went wrong and the user needs rescue steps first

### Step 3: Pick the safest Git move, not the fanciest one
Use these rules:

- Prefer **`git status` + `git branch --show-current` + `git log --oneline --decorate -5`** before irreversible actions.
- Prefer **`git add -p`** or explicit file staging when commit boundaries matter.
- Prefer **`git commit --amend` / interactive rebase** only on local or safely rewritable branches.
- Prefer **`git pull --rebase` / `git fetch` + `git rebase origin/main`** when the team wants linear history and the branch is not a shared integration branch.
- Prefer **merge** when preserving integration context or avoiding risky history rewrites matters more than linear history.
- Prefer **`git push --force-with-lease`**, never raw `--force`, after rebases or amended history that must update a remote branch.
- Prefer **`git revert`** over `reset --hard` when the bad commit is already shared and the goal is safe collaborative undo.
- Prefer **`git reflog`** before panic when commits seem lost.

### Step 4: Apply the decision ladder
Use this ladder when deciding between common alternatives:

#### Merge vs rebase
- **Use rebase** when:
  - the branch is primarily yours,
  - the goal is a cleaner reviewable history,
  - rewriting the branch will not surprise collaborators,
  - conflict resolution effort is acceptable.
- **Use merge** when:
  - the branch is shared,
  - preserving branch integration history matters,
  - rebasing would create confusing rewrite risk,
  - the team already expects merge commits.

#### Revert vs reset
- **Use revert** when the bad commit is already pushed/shared.
- **Use reset** when the history is still local and you intentionally want to rewrite it.
- **Use restore / checkout of files** when only the worktree/index needs fixing, not the branch history.

#### Force-with-lease vs normal push
- **Use normal push** when history is unchanged and the remote is simply ahead/behind in a normal way.
- **Use `--force-with-lease`** only after rebase, amend, squash, or other history rewrite, and only when you are confident about the remote state.
- If the branch appears shared and you are unsure who else has pushed, stop and call out the collaboration risk.

### Step 5: Build the local Git brief
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

### Step 6: Use these mode-specific patterns

**For branch-and-stage hygiene**
- start with branch name and dirty/clean state
- use explicit staging or `git add -p`
- keep unrelated changes out of the same commit
- call out whether a temporary stash is safer than carrying unrelated changes forward

**For commit-shaping**
- recommend one clean commit per meaningful review unit when possible
- use `git commit --amend` only before the commit is shared or when shared rewrite is explicitly acceptable
- use `git rebase -i` for squash/reword/fixup on local branch history
- prefer conventional or repo-specific commit format when known

**For sync-with-base**
- fetch first
- decide merge vs rebase explicitly
- say whether the branch is safe to rewrite
- if conflicts are likely, point to the fallback before starting

**For conflict-resolution**
- show the loop clearly: inspect → edit conflict markers or resolve with tool → `git add` → continue/commit
- remind the user whether they are in merge or rebase state
- keep the next action mechanical and calm; conflict handling is a sequence, not a philosophy essay

**For push-safety**
- state whether upstream exists
- distinguish normal push, rejected push, and rewritten-history push
- prefer `--force-with-lease` after rebase/amend, never raw `--force`
- if the remote branch is shared or policy-protected, say so explicitly

**For undo-and-recovery**
- identify what was lost or changed: commit, file, branch pointer, worktree contents, or remote state
- inspect reflog before destructive cleanup
- create a rescue branch if needed before further edits
- prefer reversible steps first when confidence is low

### Step 7: Keep boundaries sharp
Before finalizing:
- Do **not** turn this into a hosted PR tutorial.
- Do **not** pretend every branch should be rebased; state the tradeoff.
- Do **not** recommend `reset --hard` casually without naming the data-loss risk.
- Do **not** bury the shared-vs-solo branch distinction.
- Do **not** drift into code-review comments, root-cause analysis, or backlog design.

## Output format
Always return a compact **Git Workflow Brief**, not a giant command dump.

Required qualities:
- choose one mode
- state the collaboration risk
- prefer the safest reversible path that solves the current problem
- make rewrite risk explicit
- include a recovery fallback when the command sequence has teeth
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
1. **Inspect before surgery.** `git status`, branch name, and recent log beat guesswork.
2. **Prefer reviewable commits over giant snapshots.** Commit shape affects review quality.
3. **Treat history rewrites as collaboration decisions, not personal preferences.** Shared branches change the answer.
4. **Use `--force-with-lease`, not raw `--force`.** Rewrite safely or do not rewrite.
5. **Reach for `reflog` early in recovery.** Lost commits are often only misplaced branch pointers.
6. **Choose the smallest safe fix.** Not every problem needs rebase, reset, or branch surgery.
7. **Route out when the problem changes.** Review quality, debugging, and planning are adjacent but distinct jobs.

## References
- [references/collaboration-boundaries.md](references/collaboration-boundaries.md)
- [references/recovery-patterns.md](references/recovery-patterns.md)
- Git documentation — https://git-scm.com/docs
- GitHub Docs, *Resolving merge conflicts after a Git rebase* — https://docs.github.com/en/get-started/using-git/resolving-merge-conflicts-after-a-git-rebase
- GitLab Docs, *Resolve conflicts from the command line* — https://docs.gitlab.com/topics/git/git_rebase/#resolve-conflicts-from-the-command-line
