# Review and Cleanup Checklist

## Review loop
Before approving a workspace/card outcome, check:
1. Does the diff match the card contract?
2. Are acceptance checks or tests mentioned and believable?
3. Should this be retried, split, or escalated to PR review?
4. Are comments or reviewer notes preserved somewhere durable?
5. Does the card status reflect reality, not wishful thinking?

## Retry guidance
Retry when:
- the task is still bounded and the current attempt mostly failed on execution
- the operator has clear feedback to send back
- the workspace context is still trustworthy

Split or recreate instead when:
- the card scope was wrong from the start
- the workspace accumulated too much junk or drift
- several unrelated changes are bundled together
- preview/runtime conflicts are making evidence unreliable

## Cleanup pass
After merge / close / abandon:
- close stale cards explicitly
- remove or prune stale worktrees
- delete stale `vk/*` branches when safe
- stop leftover preview/dev servers
- capture any durable decision that would otherwise vanish with the card

## Why this matters
Board tools create invisible debt when cleanup is skipped. The workflow is only better than plain PR review if it reduces chaos instead of creating a bigger pile of stale branches, logs, and half-reviewed workspaces.
