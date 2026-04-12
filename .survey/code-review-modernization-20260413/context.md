# Context: code-review modernization

## Workflow Context
Modern code review is usually anchored in pull-request / merge-request workflows rather than a standalone "read this diff" task. GitHub review state, CODEOWNERS routing, GitLab approval rules, required status checks, preview deployments, and changelist-style review tools all push review toward a workflow-aware practice instead of a generic checklist. In the current repo, `git-workflow` already states that commit hygiene is not the same thing as review judgment, which makes `code-review` the right place to own correctness / maintainability / risk review rather than local Git mechanics.

Sources:
- GitHub Docs — About pull request reviews: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
- GitHub Docs — About code owners: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- GitHub Docs — About protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitLab Docs — Merge request approvals: https://docs.gitlab.com/ee/user/project/merge_requests/approvals/
- Vercel Docs — Environments / pre-production deployments: https://vercel.com/docs/deployments/pre-production
- Repo boundary note — `.agent-skills/git-workflow/references/collaboration-boundaries.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Individual contributor | Prepare and review diffs, explain intent, respond to comments, decide whether a change is ready | Mixed |
| Maintainer / tech lead | Approve or block risky changes, enforce code-owner / approval expectations, keep review quality high | Advanced |
| Frontend / UX-oriented reviewer | Check behavior, accessibility, screenshots/previews, and implementation risk, not just raw code style | Mixed |
| Backend / platform reviewer | Check migrations, authz/authn, compatibility, performance, rollout safety, and observability impact | Advanced |
| Game-dev / engine reviewer | Review gameplay / tooling code while recognizing that binary assets and generated files often need separate validation | Advanced |

## Current Workarounds
1. Teams rely on native PR/MR mechanics — required approvals, CODEOWNERS, required checks, and protected branches — to compensate for inconsistent human review.
2. Bots and CI gates carry part of the review load: lint, tests, type checks, code scanning, and policy automation catch repetitive issues before reviewers read deeply.
3. Frontend reviewers often rely on screenshots, videos, Storybook/preview links, or staging deployments because UI behavior is under-described by the diff alone.
4. Large or complex changes are split into smaller review units or patch stacks when ordinary PR review becomes too slow or shallow.
5. Asset-heavy and game workflows often split "code review" from editor/playtest/manual validation because many important changes are not meaningfully reviewable as plain text.

Representative sources:
- GitHub Docs — Attaching files: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files
- GitHub Docs — About protected branches: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- GitHub repository — reviewdog: https://github.com/reviewdog/reviewdog
- Danger JS: https://danger.systems/js/
- GitHub Docs — About pull request reviews: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews

## Adjacent Problems
- **Git mechanics vs review judgment:** `git-workflow` owns branch cleanup, rebases, conflict handling, and safe pushes; `code-review` should own the quality/risk judgment on the resulting diff.
- **Testing policy vs review comments:** `testing-strategies` should decide broader coverage policy and CI shape, while `code-review` should call out missing or mismatched validation in the current change.
- **Debugging vs review:** `debugging` owns reproduce → isolate → verify loops after a failure occurs; `code-review` should flag likely failure modes before merge, not absorb runtime diagnosis.
- **Visual / UX critique vs code review:** `web-design-guidelines` and preview-based checks cover UX consistency and accessibility nuance that cannot be inferred from implementation alone.
- **Hosted PR administration vs review reasoning:** reviewer assignment, labels, merge queues, and branch protection live closer to repo-management workflows than to the review skill itself.

Repo evidence:
- `.agent-skills/git-workflow/references/collaboration-boundaries.md`
- `.agent-skills/testing-strategies/SKILL.md`
- `.agent-skills/debugging/SKILL.md`
- `.agent-skills/web-design-guidelines/SKILL.md`

## User Voices
- "Collaborate on pull requests to improve code quality." — GitHub's pull-request-review framing reinforces that review is a collaboration workflow, not just a static checklist. Source: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/about-pull-request-reviews
- "You can use a CODEOWNERS file to define individuals or teams that are responsible for code in a repository." — ownership/routing is part of review reality. Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
- "You can protect important branches by setting branch protection rules ... and set requirements for any pushes." — review is strongly coupled to merge policy and checks. Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
- "You can convey information by attaching a variety of file types to your issues and pull requests." — frontend/UI reviewers routinely need visual evidence beyond the diff. Source: https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/attaching-files
- "`git-workflow` can prepare a clean branch for review, but it should not pretend that commit hygiene is the same thing as review judgment." — the repo already expects `code-review` to own judgment, not Git hygiene. Source: `.agent-skills/git-workflow/references/collaboration-boundaries.md`
