# Context: user-guide-writing structural hardening

## Workflow Context
`user-guide-writing` sits at the recurring seam where product changes turn into end-user help: getting started, task how-tos, FAQs, and release-driven help updates. Repo-local evidence shows the real failure mode is not missing coverage but weak separation between internal docs, API docs, user help, and release-note work. Primary docs frameworks reinforce the same pattern: Diátaxis separates tutorials from how-to guides, GitLab treats docs as part of the review workflow, and Google/Microsoft keep user-facing procedures audience-aware and task-first.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Docs owner / technical writer | Chooses the right page type, keeps the guide scannable, and preserves boundaries with other doc lanes | Advanced |
| Product manager / launch owner | Supplies workflow changes, release timing, and doc refresh priorities | Intermediate |
| Support / customer success | Feels repeated questions first and turns recurring replies into durable docs | Intermediate |
| SME (engineer / designer / ops lead) | Verifies current UI labels, permissions, edge cases, and expected outcomes | Advanced |
| End user / admin reader | Follows the guide and gets blocked by stale steps, hidden prerequisites, or role-specific differences | Mixed |

## Current Workarounds
1. Repeated support answers eventually become an FAQ or ad hoc help article.
2. Teams patch the changed page first and defer the larger docs cleanup.
3. Screenshots and video capture stand in for clearer page structure.
4. Release notes ship before help-center updates, so stale steps linger.
5. Search and support signals reveal drift, but humans still manually convert them into rewrite plans.

## Adjacent Problems
- Internal specs, runbooks, migration docs, and ADRs that belong to `technical-writing`
- API portals, SDK docs, and developer quickstarts that belong to `api-documentation`
- Release summaries and changelog upkeep that belong to `changelog-maintenance`
- Decks or launch presentations that belong to `presentation-builder`
- Marketing copy, lifecycle messaging, and GTM content that belong to `marketing-automation`

## User Voices
- "Write a getting-started guide for new workspace admins inviting their team and creating the first project." — repo eval showing first-success onboarding demand
- "Update our help-center article for exporting reports because the Export button moved into the Reports header and only admins can choose XLSX now." — repo eval showing stale-doc + changed-UI maintenance pressure
- "Turn these repeated billing support replies into a short FAQ for workspace owners." — repo eval showing support-to-doc conversion as a real workflow input
- Diátaxis explicitly warns that tutorial vs how-to is the most common documentation conflation, which maps directly onto the skill’s current mode-selection problem.

## Sources
- Repo-local: `.agent-skills/user-guide-writing/SKILL.md`, `references/document-modes-and-boundaries.md`, `references/workflow-checklist.md`, `references/maintenance-signals.md`, `evals/evals.json`, `.agent-skills-wiki/queries/user-guide-writing-modernization-2026-04-13.md`, `graphify-out/GRAPH_REPORT.md`
- Direct primary-page retrieval: https://diataxis.fr/ , https://diataxis.fr/tutorials/ , https://diataxis.fr/how-to-guides/ , https://docs.gitlab.com/development/documentation/ , https://docs.gitlab.com/development/documentation/topic_types/ , https://developers.google.com/style , https://learn.microsoft.com/en-us/style-guide/welcome/
