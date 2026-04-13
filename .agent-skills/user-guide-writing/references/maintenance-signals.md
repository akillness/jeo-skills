# Maintenance signals for user-guide-writing

The hardest part of user-facing docs is not initial drafting. It is knowing **when a guide is stale** and what to update first.

## Strong update signals
- UI labels, menus, or screen order changed after a release
- support starts re-answering the same question manually
- help-center search terms reveal zero-result or poor-result queries
- a feature gained new permissions, role checks, or plan limits
- screenshots no longer match the current UI
- users reach the page but still fail the task
- related docs disagree about the same workflow

## Weak but useful signals
- article has high traffic but low helpfulness votes
- launch notes mention a feature change but the help article stays untouched
- internal SMEs warn that the existing instructions are now "close enough" instead of correct
- a tutorial requires too much hidden context from onboarding calls or support macros

## Practical maintenance loop
1. Detect the stale signal.
2. Confirm the product truth: new UI path, permissions, expected result.
3. Decide the smallest doc mode that solves the problem.
4. Patch the live guide before writing a broad new manual.
5. List companion docs that must stay in sync.
6. Record screenshots/placeholders that need replacement.

## Common sync surfaces
- help-center article ↔ tutorial
- getting-started guide ↔ FAQ
- release update ↔ existing task-based article
- public guide ↔ support macro / saved reply

## Good maintenance outputs
- concise stale-doc refresh plan
- updated how-to article with new steps
- FAQ patch that answers the new blocker
- release-help update that explains what changed and links the affected guides

## Boundary reminder
Maintenance work still belongs in `user-guide-writing` **only when the output is customer-facing guidance**. If the real work is release-note summarization, use `changelog-maintenance`; if the work is internal rollout or migration coordination, use `technical-writing`.
