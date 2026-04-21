# Git Workflow Mode Selection and Command Packets

Use this file when the main `Git Workflow Brief` needs a slightly fuller command packet.
The front door should stay short; this file carries the mechanical detail.

## Mode selection cheatsheet

| Situation | Choose this mode | Why |
|---|---|---|
| Need a clean branch, staging plan, or stash decision | `branch-and-stage hygiene` | Worktree/index state is the real problem |
| Commits are messy and need cleanup before review | `commit-shaping` | Reviewability and history boundaries matter most |
| Branch must catch up with `main` / `origin/main` | `sync-with-base` | The key choice is merge vs rebase |
| A merge or rebase is already conflicted | `conflict-resolution` | The user needs the next safe loop, not philosophy |
| Push is rejected or history was rewritten | `push-safety` | Remote-collaboration risk is the main constraint |
| Reset/rebase/amend/checkout went wrong | `undo-and-recovery` | Rescue and reversibility matter more than progress |

## Baseline inspection packet
Run these first unless the user already supplied the answers:

```bash
git status
git branch --show-current
git log --oneline --decorate -5
```

If remote state matters, add:

```bash
git remote -v
git fetch origin
git status -sb
```

## Branch-and-stage hygiene packet

```bash
git branch --show-current
git status
git add -p
# or explicit staging
# git add path/to/file
```

Use a stash only when it clearly reduces risk:

```bash
git stash push -u -m "temp-before-branch-cleanup"
```

## Commit-shaping packet
Use only when rewrite risk is acceptable.

```bash
git status
git add -p
git commit --amend
# or
git rebase -i HEAD~N
```

Good prompts to name in the brief:
- which commits should stay separate?
- has any of this history already been pushed/shared?
- is the goal squash, reword, split, or fixup?

## Sync-with-base packet

```bash
git fetch origin
# linear-history case
git rebase origin/main
# or preserve-integration-context case
git merge origin/main
```

Call out before running:
- whether the branch is solo or shared
- whether a later `--force-with-lease` will be required
- what the fallback is if conflict volume gets ugly

## Conflict-resolution packet

```bash
git status
# resolve files, remove conflict markers, or use a merge tool
git add <resolved-files>
git rebase --continue
# or, for merge state:
# git commit
```

Fallbacks:

```bash
git rebase --abort
git rebase --skip
# or if this is a merge:
# git merge --abort
```

Use `skip` only when dropping the conflicted patch is intentional.

## Push-safety packet
Normal branch push / upstream setup:

```bash
git push -u origin <branch>
```

After intentional history rewrite:

```bash
git push --force-with-lease origin <branch>
```

Rejected push packet:

```bash
git fetch origin
git status -sb
git log --oneline --decorate --graph --all -10
```

Then decide whether the safe next move is merge, rebase, or pause for coordination.

## Undo-and-recovery packet
Lost commit / bad reset / bad rebase first pass:

```bash
git reflog
git branch rescue/<topic> <sha-from-reflog>
git log --oneline --decorate rescue/<topic> -5
```

Wrong-branch commit pattern:

```bash
git branch feature/correct-branch
# inspect before resetting the old branch
# git log --oneline --decorate -5
git reset --hard HEAD~1
```

Detached HEAD rescue:

```bash
git status
git switch -c rescue/detached-head-work
```

## Safety reminders
- Prefer rescue branches when confidence is low.
- Prefer `revert` over history rewrite for already-shared commits.
- Prefer `--force-with-lease` over raw `--force`.
- Prefer explicit route-outs when the question is really about review quality, planning, or hosted PR operations.
