# Handoff Boundaries

## Use `code-review` when the main question is
- Is this diff or PR ready to merge?
- What reviewer comments matter most?
- Should this be approved, blocked, or sent back for changes?
- What evidence is missing before approval?

## Route to `git-workflow` when the main question is
- how to split or reorder commits
- rebase vs merge choice
- conflict resolution mechanics
- safe push / recovery after history rewrite

`git-workflow` prepares a reviewable diff. `code-review` judges the diff once it exists.

## Route to `debugging` when the main question is
- why a failure is happening now
- how to reproduce or isolate the issue
- what the likely root cause is
- how to verify a fix after a live bug or flaky failure

`code-review` is preventive. `debugging` is diagnostic.

## Route to `testing-strategies` when the main question is
- what the long-term coverage model should be
- how to shape unit/integration/E2E layers
- how to reduce flaky suites or set CI policy
- what broader testing program the team should adopt

`code-review` can say a change needs more evidence. `testing-strategies` decides the broader testing shape.

## Route to `web-design-guidelines` / `web-accessibility` when the main question is
- visual consistency
- accessibility compliance
- layout polish
- interaction behavior that needs UX/design critique beyond implementation risk

`code-review` should still note when preview evidence is missing, but it should not absorb pure design governance.

## Route to repo / PR workflow skills when the main question is
- assign reviewers or labels
- interpret CODEOWNERS or branch protection
- create/edit/manage the PR itself
- merge queue, auto-merge, or repository settings

## Rule of thumb
If the user is asking for **judgment on a change**, stay in `code-review`.
If the user is asking for **how to shape, diagnose, administer, or visualize the work around the change**, route to the neighboring skill.
