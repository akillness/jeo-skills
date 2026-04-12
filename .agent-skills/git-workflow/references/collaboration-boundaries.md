# Git Workflow Boundaries

Use `git-workflow` when the question is primarily about **local repository state**:
- branch creation and naming
- staging and partial staging
- commit cleanup
- merge vs rebase choice
- conflict resolution mechanics
- safe pushes after history rewrite
- undo/recovery after resets, rebases, or lost commits

## Route away when the need changes

### Review quality and architecture feedback
Use a review workflow such as `code-review` when the real question is:
- Is this diff correct?
- Is the architecture good?
- Are there security, performance, or testing issues?

`git-workflow` can prepare a clean branch for review, but it should not pretend that commit hygiene is the same thing as review judgment.

### Planning and backlog shaping
Use `task-planning` when the real question is:
- What tasks or slices should exist?
- How should this feature be decomposed?
- What are the dependencies and acceptance criteria?

Git should happen after the work packet is clear enough to execute.

### Debugging and regression analysis
Use `debugging` when the real question is:
- Why did this break?
- How do we reproduce the issue?
- What is the root cause and how do we verify the fix?

`git-workflow` can help with `git bisect`, revert, and history inspection, but not with root-cause reasoning itself.

### Hosted PR and repo administration
Use a dedicated PR/repo-management workflow when the real question is:
- create or manage a GitHub/GitLab pull request
- assign reviewers or labels
- interpret branch protection or merge queue policy
- change repo settings, remotes, or permissions at the hosted-service level

## Core rule
`git-workflow` owns **safe local Git moves**.
It does not own every task that happens to occur near Git.
