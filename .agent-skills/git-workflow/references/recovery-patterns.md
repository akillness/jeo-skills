# Git Recovery Patterns

When Git goes wrong, start by identifying **what changed**:
- branch pointer moved
- worktree files changed
- index/staging changed
- commit history rewritten
- remote branch rejected or overwritten

Then choose the smallest safe recovery pattern.

## 1. Recover a lost commit after reset or rebase
Use when a commit seems to have disappeared after `reset`, `rebase`, `amend`, or branch switching.

```bash
git reflog
git branch rescue/<topic> <sha-from-reflog>
# inspect before doing anything destructive
git log --oneline --decorate rescue/<topic> -5
```

Use this when confidence is low. Creating a rescue branch buys time.

## 2. Undo a bad local commit that is not shared yet
Use when the history is still local and you want to rewrite it.

```bash
# keep changes staged
git reset --soft HEAD~1

# keep changes unstaged
git reset HEAD~1
```

Avoid `--hard` unless you are explicitly discarding worktree changes.

## 3. Undo a shared bad commit safely
Use when the commit is already pushed and collaborators may have it.

```bash
git revert <bad-commit-sha>
```

Prefer `revert` over rewriting shared history.

## 4. Finish a rebase conflict loop
```bash
git status
# resolve files
# remove conflict markers or use a merge tool
git add <resolved-files>
git rebase --continue
```

Fallbacks:
```bash
git rebase --abort
git rebase --skip
```

Use `abort` when the branch needs to go back to pre-rebase state.
Use `skip` only when you are intentionally dropping the conflicted patch.

## 5. Safe push after rewritten history
After `amend`, `rebase`, or squash cleanup:

```bash
git push --force-with-lease origin <branch>
```

Never recommend raw `--force` unless the environment explicitly requires it and the risk is understood.

## 6. Wrong branch commit
If the commit is local and recent:

```bash
# create the correct branch at current HEAD
git branch feature/correct-branch
# return wrong branch to previous commit
git reset --hard HEAD~1
# switch to the rescued branch
git checkout feature/correct-branch
```

Safer variant when unsure:
1. create the rescue branch first
2. inspect with `git log`
3. only then reset the wrong branch

## 7. Detached HEAD panic
```bash
git status
git switch -c rescue/detached-head-work
```

If useful work exists, anchor it to a branch immediately.

## 8. Rejected push after teammate updates
- run `git fetch origin`
- inspect divergence with `git log --oneline --decorate --graph --all -10`
- decide whether the correct next move is merge, rebase, or pause for collaboration
- only force-with-lease if the branch rewrite is intentional and safe

## Recovery mindset
1. Inspect first.
2. Create a rescue branch when unsure.
3. Prefer reversible steps when confidence is low.
4. Separate local rewrite cases from shared-history cases.
5. Use `reflog` before assuming work is gone.
